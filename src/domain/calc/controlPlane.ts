// コントロールプレーンの計算と確認項目。
import { has, type NV, type SizingModel } from '../parse';
import { fmt, fmtMiB, type ResultItem, type Section, type Status } from '../result';
import { CP_SCALE_ROWS, type ScaleRow } from '../sources';
import { GB } from '../units';
import type { WorkerBasis } from '../types';
import { b, nvText, off } from './helpers';
import { installMinItems, localDiskItems } from './roleChecks';
import { SCALE_RULE, selectScaleRow } from './scale';
import type { ServicesCalc } from './services';

export interface WorkerCount {
  value: number | null;
  text: string;
  missing: string[];
}

export function workerCount(basis: WorkerBasis, manual: NV, computeCount: number | null, computeFrom: string, infraCount: number | null): WorkerCount {
  if (basis === 'manual') {
    return has(manual) ? { value: manual.v, text: `手入力 ${fmt(manual.v)} 台`, missing: [] } : { value: null, text: '手入力（未入力）', missing: ['比較に使う Worker 台数（手入力）'] };
  }
  if (computeCount === null) return { value: null, text: 'コンピュート台数が未確定', missing: ['コンピュートの候補台数、または必要台数を求める入力'] };
  if (basis === 'computePlusInfra') {
    const inf = infraCount ?? 0;
    return { value: computeCount + inf, text: `コンピュート ${fmt(computeCount)} 台（${computeFrom}）+ インフラ ${fmt(inf)} 台`, missing: [] };
  }
  return { value: computeCount, text: `コンピュート ${fmt(computeCount)} 台（${computeFrom}）`, missing: [] };
}

export interface CpCalc {
  sections: Section[];
  row: ScaleRow | null;
  rowStatus: Status;
  perNodeCpu: number;
  perNodeMemGB: number;
  count: number | null;
  candidateCpu: number | null;
  candidateMemMiB: number | null;
  items: ResultItem[];
}

export function calcControlPlane(model: SizingModel, svc: ServicesCalc, computeCount: number | null, computeFrom: string): CpCalc {
  const role = model.roles.controlPlane;
  const P = 'cp';
  const items: ResultItem[] = [];
  const count = has(role.count) ? role.count.v : null;
  items.push({
    id: `${P}.count`,
    label: 'コントロールプレーンの台数',
    kind: 'official_min',
    status: count === null ? 'unconfirmed' : count === off('installCpCount') ? 'ok' : 'individual',
    text: count === null ? `${off('installCpCount')} 台（候補台数は未入力）` : `候補 ${fmt(count)} 台 ／ 基準 ${off('installCpCount')} 台`,
    refs: ['installCpCount'],
    note: count !== null && count !== off('installCpCount') ? '3 台以外の構成はこのアプリの適用範囲外のため要個別評価' : undefined,
  });
  const installItems = installMinItems(role, P, { cpu: 'installCpCpu', ram: 'installCpRam', disk: 'installCpDisk', iops: 'installCpIops' });

  // 試験表の参考点
  const infraCount = model.infraEnabled && has(model.roles.infra.count) ? model.roles.infra.count.v : null;
  const wc = workerCount(model.cpWorkerBasis, model.cpWorkerManual, computeCount, computeFrom, infraCount);
  const ns = has(model.namespaces) ? model.namespaces.v : null;
  let row: ScaleRow | null = null;
  let rowStatus: Status = 'not_calculated';
  const missing = [...wc.missing, ...(ns === null ? ['Namespace 数'] : [])];
  if (wc.value !== null && ns !== null) {
    row = selectScaleRow(CP_SCALE_ROWS, wc.value, ns);
    rowStatus = row ? 'calculated' : 'individual';
  }
  const scaleItems: ResultItem[] = [];
  scaleItems.push({
    id: `${P}.scaleRow`,
    label: '試験結果の参考点（1 台あたり）',
    kind: 'official_rec',
    status: rowStatus,
    text: row
      ? `${row.cpuCores} コア・${row.memoryGB} GB（試験条件：コンピュート ${row.nodes} 台、${fmt(row.namespaces)} Namespace）`
      : rowStatus === 'individual'
        ? '公式試験の適用範囲（OVN-Kubernetes で 252 台・4,000 Namespace）を超えるため要個別評価'
        : undefined,
    basis: [b('比較に使う Worker 台数', wc.text), b('Namespace 数', nvText(model.namespaces)), b('ネットワークプラグイン', 'OVN-Kubernetes（4.22 の既定）')],
    refs: row ? [row.id] : ['cpScale24', 'cpScale120', 'cpScale252Ovn', 'cpScale501'],
    note: `${SCALE_RULE}。AWS 上の cluster-density 試験の値。252 台の行は OVN-Kubernetes 使用時の値。501 台の行は OVN-Kubernetes 未検証のため自動参照に含めない`,
    missing: missing.length ? missing : undefined,
  });
  scaleItems.push({
    id: `${P}.scaleScope`,
    label: 'Operator・API オブジェクト更新負荷',
    kind: 'input',
    status: 'info',
    text: model.operatorNotes ? `メモ：${model.operatorNotes}` : 'メモなし',
    refs: ['cpScope'],
    note: '導入 Operator 数やオブジェクトの作成・更新頻度により、実際の必要量は試験値から変わる',
  });
  let candCpuStatus: Status = 'unconfirmed';
  let candMemStatus: Status = 'unconfirmed';
  if (row) {
    candCpuStatus = has(role.cpu) ? (role.cpu.v >= row.cpuCores ? 'ok' : 'ng') : 'unconfirmed';
    const memGB = has(role.ramMiB) ? (role.ramMiB.v * 2 ** 20) / GB : null;
    candMemStatus = memGB !== null ? (memGB >= row.memoryGB ? 'ok' : 'ng') : 'unconfirmed';
    scaleItems.push({
      id: `${P}.candVsRow`,
      label: '候補ノードと試験の参考点',
      kind: 'derived',
      status: candCpuStatus === 'ng' || candMemStatus === 'ng' ? 'ng' : candCpuStatus === 'ok' && candMemStatus === 'ok' ? 'ok' : 'unconfirmed',
      text: `CPU 候補 ${nvText(role.cpu)} ／ 参考 ${row.cpuCores} コア、メモリ候補 ${memGB !== null ? `${fmt(memGB)} GB` : '未入力'} ／ 参考 ${row.memoryGB} GB`,
      refs: [row.id],
    });
  }
  const onCp = svc.byPlacement.controlPlane;
  if (onCp.services.length) {
    scaleItems.push({
      id: `${P}.svcOnCp`,
      label: 'コントロールプレーンに配置するサービス',
      kind: 'derived',
      status: 'unconfirmed',
      text: `CPU ${fmt(onCp.cpu)} コア、メモリ ${fmtMiB(onCp.memMiB)}（${onCp.services.join('、')}）`,
      note: '試験の参考点には含まれない追加負荷。60% の運用指針と実測で確認する',
    });
  }

  // 運用指針・etcd
  const m = model.cpMetrics;
  const util = (n: NV, label: string, key: string): ResultItem => ({
    id: `${P}.${key}`,
    label: `平常時の ${label} 使用率（60% 以下の運用指針）`,
    kind: has(n) ? 'measured' : 'official_rec',
    status: has(n) ? (n.v <= off('cpUtilGuideline') ? 'ok' : 'ng') : 'unconfirmed',
    text: has(n) ? `実測 ${fmt(n.v)} % ／ 指針 ${off('cpUtilGuideline')} % 以下` : `指針 ${off('cpUtilGuideline')} % 以下（実測待ち）`,
    refs: ['cpUtilGuideline'],
    note: '大規模・高密度の 3 台構成向けの運用指針。試験表の推奨サイズに一律で適用して再計算しない',
    missing: has(n) ? undefined : [`平常時の ${label} 使用率（実測）`],
  });
  const opsItems: ResultItem[] = [
    util(m.cpuUtil, 'CPU', 'cpuUtil'),
    util(m.memUtil, 'メモリ', 'memUtil'),
    {
      id: `${P}.fsync`,
      label: 'etcd ディスクの p99 fsync（10 ms 未満）',
      kind: has(m.fsyncMs) ? 'measured' : 'official_rec',
      status: has(m.fsyncMs) ? (m.fsyncMs.v < off('etcdFsyncP99') ? 'ok' : 'ng') : 'unconfirmed',
      text: has(m.fsyncMs) ? `実測 ${fmt(m.fsyncMs.v)} ms` : '測定待ち',
      refs: ['etcdFsyncP99'],
      missing: has(m.fsyncMs) ? undefined : ['etcd ディスクの p99 fsync（実測）'],
    },
    {
      id: `${P}.rtt`,
      label: 'etcd メンバー間の p99 RTT（50 ms 未満）',
      kind: has(m.rttMs) ? 'measured' : 'official_rec',
      status: has(m.rttMs) ? (m.rttMs.v < off('etcdRttP99') ? 'ok' : 'ng') : 'unconfirmed',
      text: has(m.rttMs) ? `実測 ${fmt(m.rttMs.v)} ms` : '測定待ち',
      refs: ['etcdRttP99'],
      missing: has(m.rttMs) ? undefined : ['etcd メンバー間の p99 RTT（実測）'],
    },
    {
      id: `${P}.etcdSeq`,
      label: 'etcd の同期書き込み性能（詳細条件）',
      kind: 'official_min',
      status: 'info',
      text: '8 KB のシーケンシャル同期書き込み（fdatasync 込み）で 50 IOPS 以上を 10 ms 未満。高負荷クラスタでは 8000 bytes・500 IOPS（2 ms）を推奨',
      refs: ['etcdSeqWriteIops', 'etcdSeqWriteIopsHeavy'],
      note: '300 IOPS はインストール時の汎用最低要件。etcd の同期書き込み遅延と RTT は別の確認項目',
    },
  ];
  const u = has(role.unavailable) ? role.unavailable.v : null;
  opsItems.push({
    id: `${P}.unavailable`,
    label: '障害・メンテナンスで利用できないノード数',
    kind: 'input',
    status: u === null ? 'unconfirmed' : u === 0 ? 'calculated' : u === 1 ? (count === 3 ? 'unconfirmed' : 'individual') : 'individual',
    text: u === null ? undefined : u === 1 && count === 3 ? '1 台停止時は残り 2 台が負荷を処理する。平常時 60% 以下の運用指針と実測で確認' : u === 0 ? '0 台' : '3 台構成で 2 台以上の停止はこのアプリでは評価できないため要個別評価',
    refs: ['cpUtilGuideline'],
    missing: u === null ? ['コントロールプレーンの利用できないノード数'] : undefined,
  });

  const diskItems = localDiskItems(role, P);
  const perNodeCpu = Math.max(off('installCpCpu'), row?.cpuCores ?? 0);
  const perNodeMemGB = Math.max(off('installCpRam'), row?.memoryGB ?? 0);
  const sections: Section[] = [
    { id: 'cp-install', title: '台数とインストール最低要件', items: [items[0], ...installItems] },
    { id: 'cp-scale', title: '公式試験の参考点', items: scaleItems },
    { id: 'cp-ops', title: '運用指針と etcd の確認', items: opsItems },
    { id: 'cp-disk', title: 'ローカルディスク', items: diskItems },
  ];
  return {
    sections,
    row,
    rowStatus,
    perNodeCpu,
    perNodeMemGB,
    count,
    candidateCpu: has(role.cpu) ? role.cpu.v : null,
    candidateMemMiB: has(role.ramMiB) ? role.ramMiB.v : null,
    items: [...items, ...installItems, ...scaleItems, ...opsItems, ...diskItems],
  };
}
