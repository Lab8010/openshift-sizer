import type { Answers, Diagnosis, PatternId, PrimaryPatternId, QuestionId, Reason } from '../data/types';
import { answerLabel, answersOnPath } from '../data/questions';
import { patterns } from '../data/patterns';
import { isOverlayRoute, isPodRoute, isPodish, multi, single } from './route';

const CHECKLIST_MAX = 7;

/** 「分からない」と答えたときに要確認として残す内容 */
const unknownShort: Partial<Record<QuestionId, string>> = {
  q1: 'アクセス方法',
  q2: '接続相手の場所',
  q3: 'VLAN の再利用',
  q4: 'IP の決まり方',
  q5: 'L2 依存の有無',
  q7: 'IP 不変の要否',
};
const unknownDetail: Partial<Record<QuestionId, string>> = {
  q1: 'クライアントがゲスト IP を直接指定しているか（接続元の設定を 1 つ開いて確認）',
  q2: '接続相手がクラスタ外に残るか（FW 許可ルールや接続ログで確認）',
  q3: '現行の VLAN / サブネットを使い続けるか（ネットワーク担当と確認）',
  q4: 'IP の決まり方がゲスト静的設定か物理 DHCP か（ゲスト OS の設定で確認）',
  q5: '同一セグメント前提の振る舞いがないか（構築手順書で確認）',
  q7: 'ライブマイグレーション時に IP 不変が必須か（利用者と確認）',
};

/**
 * §6.2 の決定木。純粋関数。
 * 戻って分岐を変えた場合の古い回答は無視する（経路上の回答だけを使う）。
 */
export function diagnose(rawAnswers: Answers): Diagnosis {
  const a = answersOnPath(rawAnswers);
  const q = (id: QuestionId) => single(a, id);

  const reasons: Reason[] = [];
  const warnings: string[] = [];
  const alternatives: PrimaryPatternId[] = [];
  const modifiers: PatternId[] = [];

  const because = (id: QuestionId, text: string) => {
    if (a[id] === undefined) return;
    reasons.push({ questionId: id, answerLabel: answerLabel(id, a), text });
  };

  let primary: PrimaryPatternId;

  if (isPodRoute(a)) {
    // ---- Pod Network ルート（パターン A） ----
    primary = 'A';
    if (q('q1') === 'name-or-lb') {
      because('q1', 'ゲスト IP を直接指定する依存がないので、Pod Network のまま Service で受ける最もシンプルな構成にできます。');
    } else {
      because('q1', 'VM への inbound がほとんどないので、ゲスト IP が宛先にならない Pod Network でも困りません。');
    }
    if (q('q6') === 'service-http-only') {
      because('q6', 'HTTP/HTTPS が中心なので、Service に加えて Route でホスト名を付けて公開します。');
    } else if (q('q6') === 'service-ok') {
      because('q6', '向先を Service / LB に変えられるので、HTTP 以外も LoadBalancer（または NodePort）で公開できます。');
    }
    if (q('q7') === 'reconnect-ok') {
      because('q7', 'ライブマイグレーションで Pod IP が変わっても、再接続でよいので Service がその変化を吸収します。');
    } else if (q('q7') === 'migration-rare') {
      because('q7', 'ライブマイグレーションをあまり使わないので、移行時に接続が切れる影響は小さく済みます。');
    }
    if (q('q5') === 'l2-none') {
      because('q5', '同一セグメント前提の振る舞いがないので、NAT を挟む Pod Network でもアプリはそのまま動きます。');
    }
  } else {
    // ---- ゲスト IP 維持ルート（B / C / D） ----
    const cameFromPodRoute = isPodish(a);

    if (cameFromPodRoute && q('q6') === 'service-ng') {
      because('q6', 'Service へ寄せられないので、ゲスト IP を直接指定して届く構成に切り替えました（Pod Network ではゲスト IP は宛先になりません）。');
    } else if (cameFromPodRoute) {
      const q5 = q('q5');
      const q7 = q('q7');
      if (q5 === 'l2-dependent' || q5 === 'unknown') {
        because(
          'q5',
          q5 === 'l2-dependent'
            ? '同一セグメント前提の振る舞いは、NAT を挟む Pod Network（A）では動きません。A を除外し、NAT を挟まない構成で再判定しました。'
            : 'L2 依存の有無が分からないので、安全側として NAT を挟む Pod Network（A）を除外し、再判定しました。',
        );
      }
      if (q7 === 'ip-must-persist' || q7 === 'unknown') {
        because(
          'q7',
          q7 === 'ip-must-persist'
            ? 'Pod Network では Pod IP がライブマイグレーションで変わり、既存の接続も切れます。IP 不変が必須なので A を除外しました。'
            : 'IP 不変が必須かどうか分からないので、安全側として IP が変わる Pod Network（A）を除外しました。',
        );
      }
      warnings.push(
        `Q1 では「${answerLabel('q1', a)}」と回答していますが、${
          q5 === 'l2-dependent' || q5 === 'unknown' ? 'L2 依存' : 'IP 不変の要件'
        }があるため Pod Network（A）では満たせません。ゲスト IP を維持する構成で再判定しました。`,
      );
    } else if (q('q1') === 'guest-ip-direct') {
      because('q1', 'ゲスト IP が宛先であり続ける必要があります。Pod Network ではゲスト IP は宛先にならないため、NAT を挟まない構成にします。');
    } else if (q('q1') === 'unknown') {
      because('q1', 'アクセス方法が確定していないので、安全側としてゲスト IP を宛先として維持できる構成で診断しました。');
    }

    if (isOverlayRoute(a)) {
      // ---- パターン B ----
      primary = 'B';
      because('q2', '接続相手も全部クラスタ内へ移るので、物理ネットワークに触らず、オーバーレイだけでゲスト IP を宛先にできます。');
      because('q3', '新規サブネットでよいので、クラスタ側でサブネットを払い出す UDN Layer2 にできます。');
      const q4 = q('q4');
      if (q4 === 'either-ok') {
        because('q4', 'IP をクラスタに任せてよいので、Persistent IPAM でライブマイグレーション後も同じ IP を維持します。');
      } else if (q4 === 'static-in-guest' || q4 === 'unknown') {
        warnings.push('ゲスト OS の静的設定のまま UDN に載せる場合は、クラスタ IPAM の払い出しと重ならないよう、IP の管理元を 1 つに決めてください。');
      } else if (q4 === 'physical-dhcp') {
        warnings.push('物理側の DHCP は、クラスタ内オーバーレイ（UDN）には届きません。クラスタ IPAM（Persistent）に切り替えるか、ゲスト静的設定に変える必要があります。');
      }
      if (q('q7') === 'ip-must-persist') {
        because('q7', 'Persistent IPAM により、ライブマイグレーションしてもゲスト IP は変わりません。');
      }
    } else {
      // ---- 物理 L2 ルート（C / D） ----
      const q11 = multi(a, 'q11');
      const wantsBridge = q11.includes('simple-legacy') || q11.includes('ovn-trouble-avoid');
      const q10 = q('q10');
      const q2 = q('q2');
      const q3 = q('q3');

      if (q2 === 'outside' || q2 === 'both') {
        because('q2', 'クラスタ外に残る相手から届く必要があるので、物理 L2（VLAN）へ出る構成にします。');
      } else if (q2 === 'unknown') {
        because('q2', '接続相手の場所が確定していないので、安全側としてクラスタ外からも届く物理 L2 構成にしました。');
      }
      if (q3 === 'reuse-vlan') {
        because('q3', '現行の VLAN・サブネット・ゲートウェイを使い続けるので、NNCP でノードを物理 VLAN へ配線します。');
      } else if (q3 === 'unknown') {
        because('q3', 'サブネットを変えてよいか分からないので、安全側として現行 VLAN をそのまま使う前提にしました。');
      } else if (q3 === 'new-subnet-ok') {
        because('q3', 'サブネットは新しくてよいものの、クラスタ外の相手から届かせるには、物理側に VLAN を用意して接続する必要があります。');
      }
      // 相手が全部内側、またはサブネットを変えてよい（ベアメタルなら CUDN + BGP の経路広報で外にも届く）なら B も併記する
      if (q2 === 'inside-together' || q3 === 'new-subnet-ok') {
        alternatives.push('B');
      }

      if (wantsBridge && q10 !== 'policy-wanted') {
        primary = 'D';
        because('q11', '既存の Linux ブリッジ運用の知見を活かしたい（または OVN を避けたい）理由があるので、OVN をバイパスする Linux Bridge にします。');
        if (q10 === 'policy-physical') {
          because('q10', '通信制御は物理 FW で完結するので、NetworkPolicy が効かない Linux Bridge でも要件を満たせます。');
        } else if (q10 === 'policy-none') {
          because('q10', 'クラスタ側の通信制御の要件がないので、NetworkPolicy が効かない Linux Bridge でも困りません。');
        }
        alternatives.unshift('C');
        warnings.push('Linux Bridge では NetworkPolicy が効かず、IP の台帳もクラスタ側に残りません。障害対応はノード OS 側の確認が中心になります。');
      } else {
        primary = 'C';
        if (wantsBridge && q10 === 'policy-wanted') {
          because('q10', 'クラスタ側で通信制御をしたいので、OVN の管理下に留まる Localnet を主診断にしました。Linux Bridge はブリッジ自体にポリシーが効かないため、代替案に回しています。');
          warnings.push('Q11 で Linux Bridge 寄りの希望がありますが、Q10 の通信制御の要件と両立しないため Localnet を主診断にしています。');
        } else if (q10 === 'policy-wanted') {
          because('q10', 'クラスタ側で通信制御をしたいので、OVN の管理下に留まる Localnet が向いています。');
        }
        alternatives.unshift('D');
      }

      const q4 = q('q4');
      if (q4 === 'static-in-guest' || q4 === 'physical-dhcp') {
        because('q4', 'IP はゲスト内の設定 / 物理 DHCP が正なので、クラスタ側の IPAM は Disabled にして二重管理を避けます。');
      } else if (q4 === 'either-ok') {
        because('q4', 'クラスタ IPAM に任せることもできますが、現行 VLAN の DHCP / ゲートウェイと二重管理にならないよう、IPAM は Disabled で出しています。');
      }
      if (q('q7') === 'ip-must-persist') {
        because('q7', '物理 VLAN 上のゲスト IP は NAT を挟まないので、ライブマイグレーションしても変わりません（移行先ノードにも同じ配線が必要です）。');
      }
    }

    if (q('q5') === 'l2-dependent' && !cameFromPodRoute) {
      because('q5', '同一セグメント前提の振る舞いは、NAT を挟まない L2 セグメントへ直接参加する構成で維持します。');
    }
    if (q('q5') === 'l2-dependent') {
      warnings.push('IP の持ち回り（VIP）やマルチキャストを使う場合は、OVN のポートセキュリティとの兼ね合いを検証環境で確かめてください。');
    }
    if (cameFromPodRoute && q('q6') !== 'service-ng') {
      because('q1', 'ホスト名 / LB 経由の接続は、ゲスト IP を維持する構成でも DNS や LB の向先をそのまま使えます。');
    }
  }

  // ---- 共通の修飾 ----
  if (q('q8') === 'multiple') {
    modifiers.push('E');
    because('q8', '複数のポートグループに繋がっているので、追加 NIC 分の Secondary ネットワーク（Localnet）も一緒に生成します。');
  }
  const q9 = q('q9');
  const networkScope = q9 === 'shared-many' ? 'cluster' : 'namespace';
  if (primary === 'B' && q9) {
    because(
      'q9',
      q9 === 'shared-many'
        ? '多数の VM で共有するセグメントなので、複数 namespace にまたがって使える CUDN で生成します。'
        : 'namespace の中で閉じて使うので、namespace スコープの UserDefinedNetwork で生成します。',
    );
  } else if (primary === 'C' && q9 === 'shared-many') {
    because('q9', '多数の VM で共有するセグメントなので、CUDN で複数 namespace に同じ Localnet を配れる形にしています。');
  }

  const exceptionNote = multi(a, 'q11').includes('high-performance') ? ('F' as const) : undefined;

  // ---- 「分からない」の扱い ----
  const unknowns = (Object.keys(a) as QuestionId[]).filter((id) => a[id] === 'unknown');
  if (unknowns.length > 0) {
    warnings.push('「分からない」と答えた質問は、安全側（ゲスト IP を維持する側）に倒して診断しています。確認できたら回答を直すと、よりシンプルな構成になる場合があります。');
  }

  const exposureType =
    q('q6') === 'service-http-only' ? 'Route' : q('q6') === 'service-ok' ? 'LoadBalancer' : 'ClusterIP';

  return {
    primary,
    modifiers,
    alternatives: [...new Set(alternatives)].filter((p) => p !== primary),
    exceptionNote,
    reasons,
    warnings,
    checklist: buildChecklist(primary, modifiers, unknowns, a),
    defaults: {
      exposureType,
      networkScope,
      clientsOutside: q('q2') !== 'inside-together',
    },
    unknowns,
  };
}

function buildChecklist(
  primary: PrimaryPatternId,
  modifiers: PatternId[],
  unknowns: QuestionId[],
  a: Answers,
): string[] {
  const confirm: string[] =
    unknowns.length <= 2
      ? unknowns.map((id) => `要確認: ${unknownDetail[id]}`)
      : [`要確認:「分からない」と回答した項目（${unknowns.map((id) => `${id.toUpperCase()} ${unknownShort[id]}`).join('、')}）`];

  const situational: string[] = [];
  if ((primary === 'C' || primary === 'D') && single(a, 'q4') === 'physical-dhcp') {
    situational.push('DHCP の MAC 予約を、移行後の VM の MAC アドレスに合わせて移し替えた（または VM 側で MAC を固定した）');
  }
  if (modifiers.includes('E')) situational.push(...patterns.E.checklist);

  const base = patterns[primary].checklist;
  const ordered = [...confirm, ...base.slice(0, 3), ...situational, ...base.slice(3)];
  return [...new Set(ordered)].slice(0, CHECKLIST_MAX);
}
