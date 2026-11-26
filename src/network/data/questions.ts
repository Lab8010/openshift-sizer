import type { Answers, Question, QuestionId } from './types';
import { isPhysicalRoute, isPodRoute, podRouteOpen, aExcludedOnPodRoute, single, multi } from '../lib/route';

/**
 * §5.2 の質問定義。表示順と分岐は next() で決まる。
 *
 * 通常の流れ
 *   Pod Network ルート : Q1 → Q6 → Q5 → Q7 → Q8 → 終了（5 問）
 *   ゲスト IP 維持ルート: Q1 → Q2 → Q3 → Q4 → Q5 → Q7 → Q8 → Q9 →（物理 L2 なら Q10 → Q11）
 *   Pod Network ルートの途中で A が除外されたら Q2 → Q3 → Q4 へ合流する
 */
export const questions: Record<QuestionId, Question> = {
  q1: {
    id: 'q1',
    title: 'VM の中で動いているサービスへは、どのようにアクセスされていますか？',
    lead: 'いちばん大事な質問です。ここで構成が大きく 2 つに分かれます。',
    help:
      'OpenShift の標準ネットワーク（Pod Network）では、ゲスト OS の IP アドレスは宛先になりません。全 VM が同じ内部アドレス（例: 10.0.2.2）を持ち、NAT を通して外とやり取りするためです。ゲスト IP を直接指定してアクセスされているなら、それを維持できる構成を選ぶ必要があります。',
    unsureHint:
      '迷ったら: 接続してくる側の設定（接続先リスト、FW の許可ルール、監視ツールの登録）を 1 つ開いてみてください。向先が IP の直書きなら 1 番目、ホスト名や LB のアドレスなら 2 番目です。',
    type: 'single',
    options: [
      {
        value: 'guest-ip-direct',
        label: 'ゲスト OS の IP を直接指定して接続されている',
        example: '接続元の設定・FW 許可・監視登録に 192.168.1.10 のような IP が直書きされている',
        consequence: 'IP を変えない構成（UDN / Localnet）で診断します',
      },
      {
        value: 'name-or-lb',
        label: 'ホスト名 / ロードバランサ / VIP 経由で接続されている',
        example: 'https://app.example.com や LB の VIP 経由。DNS で向先を変えられる',
        consequence: '最もシンプルな Pod Network 構成で診断します',
      },
      {
        value: 'outbound-only',
        label: 'VM から外へ接続するのが主',
        example: 'VM から DB や API へ繋ぎに行く側。入ってくる接続は SSH 程度',
        consequence: 'Pod Network 構成で診断します',
      },
      {
        value: 'unknown',
        label: '分からない / 混在している',
        example: '担当外のシステムから何が来ているか把握しきれていない',
        consequence: '安全側（IP を変えない構成）で診断し、要確認として残します',
      },
    ],
    next: (a) => {
      const q1 = single(a, 'q1');
      return q1 === 'name-or-lb' || q1 === 'outbound-only' ? 'q6' : 'q2';
    },
  },

  q2: {
    id: 'q2',
    title: 'その VM に接続してくる相手は、主にどこにいますか？',
    lead: '相手がクラスタの外に残るかどうかで、物理ネットワークに触る必要があるかが決まります。',
    help:
      '接続相手も全部まとめて OpenShift へ移行するなら、物理ネットワークに触らずクラスタ内のオーバーレイだけで「ゲスト IP = 本物の宛先」を実現できます。クラスタの外に残る相手がいるなら、物理 L2（VLAN）へ出す構成が必要です。',
    unsureHint:
      '迷ったら: その VM の FW 許可ルールや接続ログを見て、送信元に今回の移行対象外のシステムや利用者端末が含まれていないか確認してください。1 つでもあれば「クラスタ外」です。',
    type: 'single',
    options: [
      {
        value: 'outside',
        label: 'クラスタ外が主',
        example: '利用者の PC、既存オンプレミスシステム、他社接続が相手',
        consequence: '物理ネットワークへ出す構成で診断します',
      },
      {
        value: 'inside-together',
        label: '接続相手も全部まとめて OpenShift へ移行する',
        example: '相手システムも今回まとめて OpenShift へ載る',
        consequence: '物理に触らない構成で診断できます',
      },
      {
        value: 'both',
        label: '内外どちらもある',
        example: '一部は一緒に移行するが、残留システムや利用者端末からも来る',
        consequence: '物理ネットワークへ出す構成で診断します',
      },
      {
        value: 'unknown',
        label: '分からない',
        example: '接続元の全体像をまだ棚卸しできていない',
        consequence: '安全側（物理ネットワークへ出す構成）で診断し、要確認として残します',
      },
    ],
    next: () => 'q3',
  },

  q3: {
    id: 'q3',
    title: '移行元の VLAN / サブネットを、そのまま使い続けますか？',
    lead: 'ゲートウェイや同じサブネットの他システムとの関係を、そのまま残すかどうかです。',
    help:
      '例: ゲートウェイは物理ルーターのまま、同じサブネットの他システムと同一セグメントで通信し続ける、ファイアウォールの許可リストが現行 IP 前提、など。そのまま使うなら、ノードの配線（NNCP）で物理 VLAN へ出る構成になります。',
    unsureHint:
      '迷ったら: その VM のデフォルトゲートウェイがどの機器か確認してください。物理ルーター / L3 スイッチで、それを変える予定がないなら「そのまま使う」です。',
    type: 'single',
    options: [
      {
        value: 'reuse-vlan',
        label: 'そのまま使う（VLAN ID・サブネット・GW を現行のまま）',
        example: '移行後も同じサブネットの残留システムと会話する。GW は物理ルーター',
        consequence: 'NNCP で物理 L2 へ出る構成になります',
      },
      {
        value: 'new-subnet-ok',
        label: '新規サブネットをクラスタ側で払い出してもよい',
        example: '接続相手も全部移る、または向先の変更ができる',
        consequence: 'クラスタ内オーバーレイで完結できます（相手が全部内側の場合）',
      },
      {
        value: 'unknown',
        label: '分からない',
        example: 'サブネットを変えてよいか、ネットワーク担当とまだ話していない',
        consequence: '安全側（現行 VLAN をそのまま使う構成）で診断し、要確認として残します',
      },
    ],
    next: () => 'q4',
  },

  q4: {
    id: 'q4',
    title: 'VM の IP アドレスは現在どう決まっていますか？',
    lead: 'IP の管理元を 1 か所に保つための質問です。',
    help:
      'ゲスト OS の静的設定や物理 DHCP を正とするなら、クラスタ側の IPAM は無効（Disabled）にして二重管理を避けます。クラスタに任せてよいなら、ライブマイグレーションしても IP が変わらない Persistent IPAM を使えます。',
    unsureHint:
      '迷ったら: ゲスト OS のネットワーク設定ファイル（Linux なら nmcli con show、Windows ならアダプターの IPv4 設定）を開き、DHCP か手入力かを見てください。',
    type: 'single',
    options: [
      {
        value: 'static-in-guest',
        label: 'ゲスト OS 内に静的に設定している',
        example: 'OS の設定ファイルに IP が書いてある',
        consequence: 'クラスタ側 IPAM は切る（Disabled）前提で出します',
      },
      {
        value: 'physical-dhcp',
        label: '物理側の DHCP から配られている（MAC 予約含む）',
        example: 'DHCP の予約表に MAC と IP の対応がある',
        consequence: 'IPAM は Disabled。予約の移し替え確認がチェックリストに入ります',
      },
      {
        value: 'either-ok',
        label: '移行を機にクラスタ側の IPAM に任せてよい',
        example: '払い出しを自動化したい。IP を決め直してもよい',
        consequence: 'Persistent IPAM 付きの構成を出します',
      },
      {
        value: 'unknown',
        label: '分からない',
        example: 'OS 設定を確認できる人が今いない',
        consequence: '安全側（クラスタ側 IPAM を使わない前提）で出し、要確認として残します',
      },
    ],
    next: (a) => (podRouteOpen(a) ? 'q8' : 'q5'),
  },

  q5: {
    id: 'q5',
    title: '同一セグメント内の通信に依存する振る舞いはありますか？',
    lead: 'NAT を挟む構成で動かなくなるアプリがないかを確認します。',
    help:
      '例: ブロードキャスト / マルチキャスト、同一サブネット同士の直接通信を前提にしたクラスタリング、IP の持ち回り（VRRP 的な構成）、送信元 IP による認証、ライセンスの IP / MAC 結びつけ等。あてはまる場合、Pod Network（masquerade）は候補から外れます。',
    unsureHint:
      '迷ったら: そのアプリの構築手順書で「VIP」「クラスタ」「マルチキャスト」「ライセンス」の 4 語を検索してください。ヒットしなければ「ない」で大丈夫です。',
    type: 'single',
    options: [
      {
        value: 'l2-dependent',
        label: 'ある',
        example: 'VM 同士で IP を持ち回る、同一セグメント前提のクラスタ、送信元 IP で認証',
        consequence: 'NAT を挟む構成は除外して診断します',
      },
      {
        value: 'l2-none',
        label: 'ない（通常の TCP/UDP のクライアント / サーバー通信だけ）',
        example: '普通の Web / API / DB 接続だけ',
        consequence: 'どの構成でも候補になります',
      },
      {
        value: 'unknown',
        label: '分からない',
        example: 'アプリの中身はベンダー任せで把握していない',
        consequence: '安全側（NAT を挟まない構成）で診断し、要確認として残します',
      },
    ],
    next: () => 'q7',
  },

  q6: {
    id: 'q6',
    title: 'VM へのアクセスを、Kubernetes の Service（＋必要に応じて Route / LoadBalancer）に寄せることはできますか？',
    lead: 'クライアント側の向先を、Service 名 / Route のホスト名 / LB の IP に変えられるか、という意味です。',
    help:
      'Pod Network では、VM へのアクセスは「Service → Pod IP → NAT → ゲスト」という経路になります。HTTP/HTTPS なら Route（ホスト名で公開）、それ以外（SSH、DB、独自の TCP/UDP）は LoadBalancer か NodePort で公開します。',
    unsureHint:
      '迷ったら: 接続元の向先を変えるのに、誰の作業が必要か考えてください。自社内の設定変更や DNS の切り替えで済むなら「できる」、他社や契約の変更が必要なら「できない」です。',
    type: 'single',
    options: [
      {
        value: 'service-ok',
        label: 'できる（向先の変更は問題ない）',
        example: '接続元の向先変更を関係者に依頼できる',
        consequence: 'Pod Network + Service（LoadBalancer）で確定します',
      },
      {
        value: 'service-http-only',
        label: 'できる。公開したいのは HTTP/HTTPS が中心',
        example: 'ブラウザや API クライアントから https で来るだけ',
        consequence: 'Pod Network + Service + Route で確定します',
      },
      {
        value: 'service-ng',
        label: 'できない（やはりゲスト IP を直接叩く必要がある）',
        example: '接続元の変更が契約・他社都合で不可能',
        consequence: 'ゲスト IP 維持ルートに戻って再診断します',
      },
    ],
    next: (a) => (single(a, 'q6') === 'service-ng' ? 'q2' : 'q5'),
  },

  q7: {
    id: 'q7',
    title: 'ライブマイグレーションに関して、どこまで求めますか？',
    lead: 'VM が別ノードへ移ったときに、IP が変わってよいかどうかです。',
    help:
      'Pod Network（masquerade）では、ライブマイグレーションで外から見える Pod IP が変わり、既存の接続は中断されます。新しい接続は Service 経由で復旧します。IP が変わらないことが必須なら、NAT を挟まない構成が必要です。',
    unsureHint:
      '迷ったら: vSphere で vMotion したとき、誰かに連絡したり設定を変えたりした経験があるか思い出してください。何もしていなかったなら、まず「再接続でよい」かを利用者に確認しましょう。',
    type: 'single',
    options: [
      {
        value: 'ip-must-persist',
        label: '移行後もゲスト IP が変わらないことが必須',
        example: '移行のたびに接続元へ連絡が必要になる、または IP 前提のライセンス',
        consequence: 'masquerade の構成は除外します',
      },
      {
        value: 'reconnect-ok',
        label: '一旦切れても、再接続できればよい',
        example: 'Web アクセス等、繋ぎ直せば済む',
        consequence: 'Service 経由の構成が使えます',
      },
      {
        value: 'migration-rare',
        label: 'ライブマイグレーション自体をあまり使わない',
        example: 'メンテナンスは計画停止で行う運用',
        consequence: '診断にはほぼ影響しません',
      },
      {
        value: 'unknown',
        label: '分からない',
        example: '移行後の運用ルールがまだ決まっていない',
        consequence: '安全側（IP を変えない構成）で診断し、要確認として残します',
      },
    ],
    next: (a) => (podRouteOpen(a) && aExcludedOnPodRoute(a) ? 'q2' : 'q8'),
  },

  q8: {
    id: 'q8',
    title: 'その VM が接続しているポートグループ（セグメント）はいくつですか？',
    lead: 'vSphere の VM 設定で、ネットワークアダプタの数と接続先を見れば分かります。',
    help:
      '複数のポートグループに繋がっている VM は、OpenShift でも NIC を複数持たせます（マルチホーム）。主となるネットワークとは別に、追加 NIC 分のネットワーク定義（Secondary）も一緒に作ります。',
    unsureHint:
      '迷ったら: vSphere Client でその VM の「設定の編集」を開き、「ネットワークアダプタ」が何個あるか数えてください。',
    type: 'single',
    options: [
      {
        value: 'single',
        label: '1 つだけ',
        example: 'ネットワークアダプタが 1 個',
        consequence: 'ネットワークは 1 系統で生成します',
      },
      {
        value: 'multiple',
        label: '複数',
        example: '業務系と管理系（またはバックアップ系）でポートグループが分かれている',
        consequence: '追加 NIC 分のネットワークも一緒に生成します',
      },
    ],
    next: (a) => (isPodRoute(a) ? 'done' : 'q9'),
  },

  q9: {
    id: 'q9',
    title: 'そのセグメント（ポートグループ）は、他の VM と共有していますか？',
    lead: 'ネットワーク定義をクラスタ全体で共有するか、namespace の中に閉じるかを決めます。',
    help:
      '多数の VM が同じポートグループを使っていて、移行後も複数の namespace で共有したいなら、クラスタスコープの ClusterUserDefinedNetwork（CUDN）で作ります。vSphere でポートグループを複数 VM に配る感覚に一番近い形です。特定システムだけで使うなら、namespace スコープで足りる場面が多くなります。',
    unsureHint:
      '迷ったら: vSphere Client でそのポートグループの「仮想マシン」タブを開き、接続している VM の台数と所属システムを見てください。',
    type: 'single',
    options: [
      {
        value: 'shared-many',
        label: '多数の VM で共有している',
        example: '同じポートグループに何十台もぶら下がっている',
        consequence: 'CUDN（複数 namespace で共有）で生成します',
      },
      {
        value: 'vm-team-only',
        label: '特定のシステムの VM 群だけで使っている',
        example: 'そのシステム専用のポートグループ',
        consequence: 'namespace スコープの定義を基本にします',
      },
      {
        value: 'single-vm',
        label: 'ほぼこの VM 専用',
        example: 'このポートグループには、この VM しか繋がっていない',
        consequence: 'namespace スコープの定義を基本にします',
      },
    ],
    next: (a) => (isPhysicalRoute(a) ? 'q10' : 'done'),
  },

  q10: {
    id: 'q10',
    title: 'VM 間の通信制御（どの VM からどの VM へ、何番ポートだけ許可、等）をクラスタ側でやりたいですか？',
    lead: 'NSX の分散ファイアウォールのようなことを、OpenShift 側に期待するかどうかです。',
    help:
      'クラスタ側で通信制御をしたいなら、OVN の管理下に留まる構成（Localnet 等）が向いています。Linux Bridge はブリッジ自体にポリシーが効かないため、物理ファイアウォールで制御する前提になります。',
    unsureHint:
      '迷ったら: 今の VM 間の通信制御がどこで行われているか確認してください。NSX の分散 FW を使っていれば 1 番目、境界の物理 FW だけなら 2 番目です。',
    type: 'single',
    options: [
      {
        value: 'policy-wanted',
        label: 'やりたい',
        example: 'NSX の分散 FW のような制御を期待している',
        consequence: 'OVN 管理下の構成を優先します',
      },
      {
        value: 'policy-physical',
        label: '物理ファイアウォール側でやるので十分',
        example: '境界の FW で制御が完結している',
        consequence: 'Linux Bridge も候補に残ります',
      },
      {
        value: 'policy-none',
        label: '特に要件はない',
        example: 'VM 間の通信制御は今もしていない',
        consequence: 'Linux Bridge も候補に残ります',
      },
    ],
    next: () => 'q11',
  },

  q11: {
    id: 'q11',
    title: 'あてはまるものはありますか？（複数選択可・任意）',
    lead: '特別な事情がなければ「特にない」で進んでください。',
    help:
      '物理 VLAN へ出る方法には、OVN の管理下に留まる Localnet と、OVN をバイパスしてノードの Linux ブリッジに直接繋ぐ Linux Bridge があります。標準は Localnet です。Linux Bridge や、NIC をデバイスごと渡す SR-IOV は、はっきりした理由があるときの例外として扱います。',
    unsureHint:
      '迷ったら: 「特にない」を選んでください。標準の構成（Localnet）で診断し、Linux Bridge は代替案として結果に並べます。',
    type: 'multi',
    options: [
      {
        value: 'simple-legacy',
        label: 'シンプルに、既存の Linux ブリッジ運用の知見のまま使いたい',
        example: 'KVM 等で Linux ブリッジを運用してきたチームがそのまま見る',
        consequence: 'Linux Bridge を候補に上げます（Q10 と矛盾する場合は Localnet 優先）',
      },
      {
        value: 'ovn-trouble-avoid',
        label: 'OVN の挙動に引きずられたくない処理がある',
        example: '特殊なプロトコルや、SDN を通したくない通信がある',
        consequence: 'Linux Bridge を候補に上げます（Q10 と矛盾する場合は Localnet 優先）',
      },
      {
        value: 'high-performance',
        label: '非常に高いスループット / 低レイテンシが要る',
        example: 'NFV やパケット処理、デバイス直結を検討したいほどの性能要件',
        consequence: 'SR-IOV を例外枠として結果末尾に添えます（主診断は変えません）',
      },
      {
        value: 'none',
        label: '特にない',
        example: '上のどれにも心当たりがない',
        consequence: '標準の構成（Localnet）で診断します',
      },
    ],
    next: () => 'done',
  },
};

/** 回答から、いま辿るべき質問の並び（未回答は既定の分岐で先読みする）を返す */
export function computePath(answers: Answers): QuestionId[] {
  const path: QuestionId[] = [];
  let current: QuestionId | 'done' = 'q1';
  while (current !== 'done' && !path.includes(current)) {
    path.push(current);
    current = questions[current].next(answers);
  }
  return path;
}

/** 経路上の回答だけを残す（戻って分岐を変えたときの古い回答を診断に使わないため） */
export function answersOnPath(answers: Answers): Answers {
  const result: Answers = {};
  for (const id of computePath(answers)) {
    if (answers[id] !== undefined) result[id] = answers[id];
  }
  return result;
}

/** 選択肢の表示ラベルを返す（理由文で回答を引用するため） */
export function answerLabel(id: QuestionId, answers: Answers): string {
  const q = questions[id];
  if (q.type === 'multi') {
    const picked = multi(answers, id);
    return q.options
      .filter((o) => picked.includes(o.value))
      .map((o) => o.label)
      .join('／');
  }
  const v = single(answers, id);
  return q.options.find((o) => o.value === v)?.label ?? '';
}

/** 質問番号の表示用（'q10' → 'Q10'） */
export function qLabel(id: QuestionId): string {
  return id.toUpperCase();
}

/**
 * §5.4.4: 前の回答と矛盾しそうな選択肢に、その場で出す注意。
 * 選択肢カードに常時表示する（選ぶ前に気づけるように）。
 */
export function inlineNotice(id: QuestionId, value: string, answers: Answers): string | undefined {
  const q1 = single(answers, 'q1');
  const viaName = q1 === 'name-or-lb' || q1 === 'outbound-only';
  const q1Label = answerLabel('q1', answers);

  if (id === 'q5' && viaName && (value === 'l2-dependent' || value === 'unknown')) {
    return `Q1 の「${q1Label}」と組み合わせると Pod Network では満たせません。ゲスト IP を維持する構成で診断し直すため、質問が 3 問ほど増えます。`;
  }
  if (id === 'q7' && viaName && (value === 'ip-must-persist' || value === 'unknown')) {
    return `Q1 の「${q1Label}」と組み合わせると Pod Network では満たせません。IP を変えない構成（B / C）で診断し直すため、質問が 3 問ほど増えます。`;
  }
  if (id === 'q3' && value === 'reuse-vlan' && single(answers, 'q2') === 'inside-together') {
    return 'Q2 で「相手も全部移行する」と答えています。物理 VLAN へ出る構成で診断し、新規サブネットで済む案（B）も併記します。';
  }
  if (
    id === 'q11' &&
    (value === 'simple-legacy' || value === 'ovn-trouble-avoid') &&
    single(answers, 'q10') === 'policy-wanted'
  ) {
    return 'Q10 で「通信制御をクラスタでやりたい」と答えています。Linux Bridge にはポリシーが効かないため、Localnet を主診断にして Linux Bridge は代替案にします。';
  }
  return undefined;
}
