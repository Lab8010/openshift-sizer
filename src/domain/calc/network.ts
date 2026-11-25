// ネットワーク経路・NIC と、ライブマイグレーションの確認。
import { has, type NV, type SizingModel } from '../parse';
import { fmt, fmtBps, fmtMiB, type ResultItem, type Section, type Status, type Table } from '../result';
import { PATH_LABELS, type PathKey } from '../types';
import { b, nonEmpty, nvText, off, sum } from './helpers';
import type { ComputeCalc } from './compute';
import type { ServicesCalc } from './services';
import type { VmCalc } from './vm';

export interface NetworkCalc {
  sections: Section[];
  clusterTxBps: number | null;
  clusterRxBps: number | null;
  nicStatus: Status;
  migrationMbps: number | null;
  items: ResultItem[];
}

interface PathAgg {
  key: PathKey;
  nic: string;
  dedicated: boolean;
  tx: number | null;
  rx: number | null;
  source: string;
  perNodeTx: NV;
  perNodeRx: NV;
}

export function calcNetwork(model: SizingModel, calcs: VmCalc[], svc: ServicesCalc, compute: ComputeCalc): NetworkCalc {
  const items: ResultItem[] = [];

  // VM から求めるゲスト通信
  const vmSum = (pick: (i: number) => NV) => {
    const missing: string[] = [];
    const vals: number[] = [];
    model.vms.forEach((v, i) => {
      const n = pick(i);
      const c = calcs[i];
      if (n.k === 'na') return;
      if (has(n) && c.running !== null) vals.push(n.v * c.running);
      else missing.push(v.name);
    });
    return { value: missing.length ? null : sum(vals), missing };
  };
  const gTx = vmSum((i) => model.vms[i].txBps);
  const gRx = vmSum((i) => model.vms[i].rxBps);
  items.push({
    id: 'net.guestVm',
    label: 'ゲスト通信（VM の同時ピーク合計、クラスタ全体）',
    kind: 'derived',
    status: gTx.value !== null && gRx.value !== null ? 'calculated' : 'not_calculated',
    text: `送信 ${gTx.value !== null ? fmtBps(gTx.value) : '未算出'}、受信 ${gRx.value !== null ? fmtBps(gRx.value) : '未算出'}`,
    formula: 'Σ（最大同時稼働台数 × 1 台あたりのピーク送信・受信）',
    missing: [...gTx.missing, ...gRx.missing].length ? [...new Set([...gTx.missing, ...gRx.missing])].map((n) => `VM「${n}」のピーク送受信`) : undefined,
  });

  // ライブマイグレーションの帯域
  const a = model.availability;
  const migItems: ResultItem[] = [];
  let migrationMbps: number | null = null;
  const target = has(a.migrationTargetSec) ? a.migrationTargetSec.v : null;
  if (target !== null && has(a.measuredTransferBytes)) {
    migrationMbps = (a.measuredTransferBytes.v * 8) / target / 1e6;
    migItems.push({
      id: 'mig.bw',
      label: '移行に必要な平均帯域（実測転送量から）',
      kind: 'derived',
      status: 'calculated',
      value: migrationMbps * 1e6,
      unit: 'bps',
      formula: '総転送 bytes × 8 ÷ 目標秒数 ÷ 10^6',
      basis: [b('実測の総転送量', nvText(a.measuredTransferBytes, (v) => `${fmt(v / 2 ** 30)} GiB`)), b('目標時間', `${fmt(target)} 秒`)],
      refs: ['VIRT-MIG'],
    });
  } else if (target !== null && compute.reserveMiB !== null) {
    const bytes = compute.reserveMiB * 2 ** 20;
    migrationMbps = (bytes * 8) / target / 1e6;
    migItems.push({
      id: 'mig.bw',
      label: '移行に必要な平均帯域（メモリ容量だけからの理想下限）',
      kind: 'derived',
      status: 'unconfirmed',
      value: migrationMbps * 1e6,
      unit: 'bps',
      formula: '(同時 drain ノード数 × ノードあたり VM メモリ最大合計) × 8 ÷ 目標秒数 ÷ 10^6',
      basis: [b('移行するメモリ量', fmtMiB(compute.reserveMiB)), b('目標時間', `${fmt(target)} 秒`)],
      note: '再送（ダーティページの再転送）等を含まない理想下限。実効帯域の判定は未確認',
      refs: ['VIRT-MIG'],
      missing: ['実測の総転送量（実効帯域の判定に必要）'],
    });
  } else {
    migItems.push({
      id: 'mig.bw',
      label: '移行に必要な平均帯域',
      kind: 'derived',
      status: 'not_calculated',
      missing: nonEmpty([...(target === null ? ['移行の目標時間'] : []), ...(has(a.measuredTransferBytes) ? [] : ['実測の総転送量、または同時 drain ノード数と配置結果'])]),
    });
  }
  if (has(a.dirtyRateBps)) {
    migItems.push({
      id: 'mig.dirty',
      label: '移行中のメモリ更新速度（参考）',
      kind: 'assumption',
      status: 'info',
      value: a.dirtyRateBps.v * 8,
      unit: 'bps',
      text: '相当',
      note: 'このアプリの確認観点：移行 1 件の帯域がメモリ更新速度を下回ると収束しにくい。更新速度が高い VM ほど高い帯域が必要（VIRT-MIG §11.2.1）',
      refs: ['VIRT-MIG'],
    });
  }

  // 経路ごとの集約
  const aggs: PathAgg[] = model.paths.map((p) => {
    let tx: number | null = has(p.clusterTx) ? p.clusterTx.v : null;
    let rx: number | null = has(p.clusterRx) ? p.clusterRx.v : null;
    let source = '入力値';
    if (p.key === 'guest' && tx === null && rx === null && (gTx.value !== null || gRx.value !== null)) {
      tx = gTx.value;
      rx = gRx.value;
      source = 'VM プロファイルからの算出値';
    }
    if (p.key === 'ingress' && tx === null && rx === null && svc.ingressPeakBps !== null) {
      source = `Ingress サービスのピーク ${fmtBps(svc.ingressPeakBps)}（方向の区別なし。送受信へは割り当てない）`;
    }
    if (p.key === 'migration' && tx === null && rx === null && migrationMbps !== null) {
      tx = migrationMbps * 1e6;
      rx = migrationMbps * 1e6;
      source = '移行の平均帯域からの算出値（送信側・受信側それぞれ）';
    }
    if (tx === null && rx === null && source === '入力値') source = p.clusterTx.k === 'na' ? '対象外' : '未入力';
    return { key: p.key, nic: p.nic, dedicated: p.dedicated, tx, rx, source, perNodeTx: p.perNodeTx, perNodeRx: p.perNodeRx };
  });
  const pathRows = aggs.map((x) => [
    PATH_LABELS[x.key],
    x.nic || '未割り当て',
    x.dedicated ? '専用' : '共有',
    x.tx !== null ? fmtBps(x.tx) : '未確認',
    x.rx !== null ? fmtBps(x.rx) : '未確認',
    nvText(x.perNodeTx, fmtBps),
    nvText(x.perNodeRx, fmtBps),
    x.source,
  ]);
  const pathTable: Table = {
    caption: '経路ごとの同時ピーク',
    columns: ['経路', 'NIC', '割り当て', '送信（クラスタ）', '受信（クラスタ）', '送信（ノードあたり）', '受信（ノードあたり）', '由来'],
    rows: pathRows,
  };
  const clusterTx = aggs.every((x) => x.tx !== null || model.paths.find((p) => p.key === x.key)?.clusterTx.k === 'na') ? sum(aggs.map((x) => x.tx ?? 0)) : null;
  const clusterRx = aggs.every((x) => x.rx !== null || model.paths.find((p) => p.key === x.key)?.clusterRx.k === 'na') ? sum(aggs.map((x) => x.rx ?? 0)) : null;
  items.push({
    id: 'net.cluster',
    label: 'クラスタ全体の同時ピーク（全経路の合計）',
    kind: 'derived',
    status: clusterTx !== null && clusterRx !== null ? 'calculated' : 'unconfirmed',
    text: `送信 ${clusterTx !== null ? fmtBps(clusterTx) : '未確認'}、受信 ${clusterRx !== null ? fmtBps(clusterRx) : '未確認'}`,
    note: 'クラスタ帯域の集約値。NIC 当たりの値はノードへの配分が分かる場合のみ評価する',
    missing: clusterTx === null || clusterRx === null ? aggs.filter((x) => x.tx === null || x.rx === null).map((x) => `${PATH_LABELS[x.key]}経路のピーク送受信`) : undefined,
  });

  // NIC ごと（コンピュートノード 1 台あたり）
  const nicBps = has(model.roles.compute.nicBps) ? model.roles.compute.nicBps.v : null;
  const groups = new Map<string, PathAgg[]>();
  aggs.forEach((x) => {
    const k = x.nic ? (x.dedicated ? `${x.nic}` : x.nic) : '';
    if (!k) return;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  });
  const nicItems: ResultItem[] = [];
  const nicStatuses: Status[] = [];
  for (const [nic, paths] of groups) {
    const conflict = paths.length > 1 && paths.some((p) => p.dedicated);
    const known = paths.every((p) => has(p.perNodeTx) && has(p.perNodeRx));
    const tx = known ? sum(paths.map((p) => (p.perNodeTx as { v: number }).v)) : null;
    const rx = known ? sum(paths.map((p) => (p.perNodeRx as { v: number }).v)) : null;
    let st: Status = 'unconfirmed';
    if (tx !== null && rx !== null && nicBps !== null) st = tx <= nicBps && rx <= nicBps ? 'ok' : 'ng';
    if (conflict && st === 'ok') st = 'unconfirmed';
    nicStatuses.push(st);
    nicItems.push({
      id: `net.nic.${nic}`,
      label: `NIC「${nic}」（${paths.map((p) => PATH_LABELS[p.key]).join('・')}${paths.length > 1 ? '、共有' : paths[0].dedicated ? '、専用' : ''}）ノードあたり`,
      kind: 'derived',
      status: st,
      text:
        tx !== null && rx !== null
          ? `送信 ${fmtBps(tx)}、受信 ${fmtBps(rx)} ／ NIC 帯域 ${nicBps !== null ? fmtBps(nicBps) : '未入力'}`
          : 'ノードへの配分が未入力のため、NIC 当たりの値は推測で割り当てない',
      formula: paths.length > 1 ? '共有 NIC：同じ NIC を使う経路のノードあたりピークを方向ごとに合計' : '専用 NIC：経路のノードあたりピークを個別に表示',
      note: conflict ? '専用に設定した経路が他の経路と同じ NIC 名になっています。割り当てを確認してください' : undefined,
      missing: nonEmpty([
        ...(known ? [] : paths.filter((p) => !(has(p.perNodeTx) && has(p.perNodeRx))).map((p) => `${PATH_LABELS[p.key]}経路のノードあたり送受信`)),
        ...(nicBps === null ? ['コンピュートの NIC 帯域'] : []),
      ]),
    });
  }
  if (!groups.size) {
    nicItems.push({ id: 'net.nic.none', label: 'NIC ごとの評価', kind: 'derived', status: 'unconfirmed', missing: ['経路ごとの NIC 割り当て'] });
    nicStatuses.push('unconfirmed');
  }
  const nicStatus: Status = nicStatuses.includes('ng') ? 'ng' : nicStatuses.every((s) => s === 'ok') ? 'ok' : 'unconfirmed';

  // ライブマイグレーションの要件
  const migPath = model.paths.find((p) => p.key === 'migration');
  const migratable = model.vms.filter((v) => v.migratable);
  const rwxStatus: Status = !migratable.length ? 'na' : migratable.some((v) => v.rwx === 'no') ? 'ng' : migratable.every((v) => v.rwx === 'yes') ? 'ok' : 'unconfirmed';
  const pm = has(a.parallelMigrations) ? a.parallelMigrations.v : off('migrationParallelCluster');
  const pn = has(a.parallelPerNode) ? a.parallelPerNode.v : off('migrationParallelPerNode');
  migItems.unshift(
    {
      id: 'mig.rwx',
      label: 'RWX 共有ストレージ（移行対象 VM）',
      kind: 'official_min',
      status: rwxStatus,
      text: migratable.length ? `${migratable.length} プロファイル中、RWX 対応 ${migratable.filter((v) => v.rwx === 'yes').length}` : '移行対象の VM なし',
      refs: ['migration'],
    },
    {
      id: 'mig.cpu',
      label: 'CPU モデルの互換性',
      kind: 'official_min',
      status: a.cpuModelCompatible === 'yes' ? 'ok' : a.cpuModelCompatible === 'no' ? 'ng' : 'unconfirmed',
      text: a.cpuModelCompatible === 'yes' ? '確認済み' : a.cpuModelCompatible === 'no' ? '互換性なし（ノードアフィニティ等の対処が必要）' : '未確認（host model CPU の VM は移行先ノードの対応が必要）',
      refs: ['migration'],
    },
    {
      id: 'mig.memory',
      label: '移行用の予備メモリ',
      kind: 'derived',
      status: compute.reserveMiB !== null ? 'calculated' : 'unconfirmed',
      value: compute.reserveMiB ?? undefined,
      unit: 'mib',
      formula: '同時 drain 最大ノード数 × 1 ノードに載る VM メモリ要求量の最大合計',
      refs: ['migrationReserve'],
      note: '判定はコンピュートの「配置と可用性の評価」を参照',
      missing: compute.reserveMiB === null ? ['コンピュートの同時 drain ノード数、配置結果'] : undefined,
    },
    {
      id: 'mig.network',
      label: '専用 Multus ネットワーク（強い推奨）',
      kind: 'official_rec',
      status: migPath?.dedicated ? 'ok' : 'unconfirmed',
      text: migPath?.dedicated ? '移行経路を専用 NIC に割り当て' : '移行経路が専用に設定されていません',
      refs: ['migration'],
    },
    {
      id: 'mig.parallel',
      label: '同時移行数の設定',
      kind: has(a.parallelMigrations) || has(a.parallelPerNode) ? 'input' : 'official_default',
      status: 'info',
      text: `クラスタ全体 ${fmt(pm)} 件、送信元ノードごと ${fmt(pn)} 件（既定はそれぞれ 5 件・2 件）`,
      refs: ['migrationParallelCluster', 'migrationParallelPerNode'],
      note: 'クラスタの同時移行件数は同時 drain ノード数としては使わない',
    },
    {
      id: 'mig.bwLimit',
      label: 'bandwidthPerMigration',
      kind: 'official_default',
      status: 'info',
      text: '既定 0（帯域上限なし）。複数 VM を同時に移行する場合は上限設定を検討',
      refs: ['migrationBandwidthDefault'],
    },
  );
  if (model.vms.some((v) => v.migratable && ((has(v.sriov) && v.sriov.v > 0) || (has(v.gpu) && v.gpu.v > 0)))) {
    migItems.push({
      id: 'mig.passthrough',
      label: 'パススルー等による移行制約',
      kind: 'derived',
      status: 'individual',
      text: 'SR-IOV・GPU を持つ移行対象 VM があります。移行可否を個別に確認してください',
    });
  }

  const sections: Section[] = [
    { id: 'net-paths', title: '経路ごとの通信', items: items, tables: [pathTable] },
    { id: 'net-nic', title: 'NIC ごとの通信（コンピュートノード 1 台あたり）', items: nicItems },
  ];
  const migSection: Section = { id: 'mig', title: 'ライブマイグレーション', items: migItems };
  return {
    sections: [...sections, migSection],
    clusterTxBps: clusterTx,
    clusterRxBps: clusterRx,
    nicStatus,
    migrationMbps,
    items: [...items, ...nicItems, ...migItems],
  };
}
