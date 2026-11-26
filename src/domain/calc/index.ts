// 計算の入口。入力 → 検証・正規化 → 各ロールの計算 → 表示文字列の生成。
import { has, parseInput, type FieldError, type SizingModel } from '../parse';
import {
  displayOf,
  fmt,
  fmtBps,
  fmtBytes,
  fmtMiB,
  STATUS_LABEL,
  type Assumption,
  type OpenItem,
  type ResultItem,
  type Section,
  type SizingResult,
  type Status,
  type SummaryCell,
  type SummaryRow,
} from '../result';
import { PRODUCT, SOURCES, resolveRef, type SourceId } from '../sources';
import type { SizingInput } from '../types';
import { GB } from '../units';
import { calcCompute, type ComputeCalc } from './compute';
import { calcControlPlane, type CpCalc } from './controlPlane';
import { off } from './helpers';
import { calcInfra, type InfraCalc } from './infra';
import { calcNetwork, type NetworkCalc } from './network';
import { calcServices } from './services';
import { calcStorage, type StorageCalc } from './storage';
import { calcVm, calcVmTotals, type VmTotals } from './vm';

export interface SizingOutput {
  result: SizingResult;
  errors: FieldError[];
  model: SizingModel;
}

export function calculateSizing(input: SizingInput, now: Date = new Date()): SizingOutput {
  const { model, errors } = parseInput(input);

  const vmCalcs = model.vms.map((v) => calcVm(v, model));
  const totals = calcVmTotals(vmCalcs);
  const svc = calcServices(model);
  const compute = calcCompute(model, vmCalcs, totals, svc);
  const computeCount = compute.candidate ?? compute.required;
  const computeFrom = compute.candidate !== null ? '候補台数' : compute.required !== null ? '必要台数の算出値' : '';
  const cp = calcControlPlane(model, svc, computeCount, computeFrom);
  const infra = calcInfra(model, svc, computeCount, computeFrom);
  const storage = calcStorage(model, vmCalcs, svc);
  const network = calcNetwork(model, vmCalcs, svc, compute);
  const bootstrap = bootstrapSection();

  const vmSections: Section[] = [
    { id: 'vm-total', title: 'ゲスト VM の合計', items: totals.items },
    ...vmCalcs.map((c) => ({ id: `vm-${c.id}`, title: `VM プロファイル「${c.name}」`, items: c.items })),
  ];

  const groups: SizingResult['groups'] = [
    { id: 'vm', title: 'ゲスト VM のスペックと要求量', sections: vmSections },
    { id: 'controlPlane', title: 'コントロールプレーン', sections: cp.sections },
    { id: 'compute', title: 'コンピュート（VM を稼働させる Worker）', sections: compute.sections },
    { id: 'infra', title: 'インフラ', sections: infra.sections },
    { id: 'services', title: 'インフラサービス（監視・Ingress・レジストリ・ログ）', sections: [{ id: 'svc', title: 'サービス別の要求量と保存量', items: svc.items }] },
    { id: 'storage', title: '共有ストレージ（容量・性能）', sections: storage.sections },
    { id: 'network', title: 'ネットワークとライブマイグレーション', sections: network.sections },
    { id: 'bootstrap', title: 'ブートストラップ（インストール時の一時リソース）', sections: [bootstrap] },
    { id: 'platform', title: '配置プラットフォーム', sections: [platformSection(model)] },
  ];

  // 表示文字列を確定
  for (const g of groups) for (const s of g.sections) for (const it of s.items) it.display = displayOf(it);

  const result: SizingResult = {
    calculatedAt: now.toISOString(),
    product: { ocp: PRODUCT.ocp, virt: PRODUCT.virt },
    inputErrorCount: errors.length,
    assumptions: assumptions(model, vmCalcs.some((c) => c.cpuReq.kind === 'assumption')),
    summary: summary(model, totals, cp, compute, infra, storage, network),
    groups,
    openItems: openItems(groups),
    usedRefs: usedRefs(groups),
    figures: {
      computeRequired: compute.required,
      computeRequiredStatus: compute.requiredStatus,
      computeCandidate: compute.candidate,
      computeCandidateStatus: compute.candidate !== null ? compute.candidateStatus : 'na',
      computeUnavailable: has(model.roles.compute.unavailable) ? model.roles.compute.unavailable.v : null,
      vmCpuPerNode: compute.vmCpuPerNode,
      vmMemPerNodeMiB: compute.vmMemPerNodeMiB,
      totalCpuDemand: compute.totalCpuDemand,
      totalMemDemandMiB: compute.totalMemDemandMiB,
      cpPerNodeCpu: cp.perNodeCpu,
      cpPerNodeMemGB: cp.perNodeMemGB,
      cpRowStatus: cp.rowStatus,
      cpRowId: cp.row?.id ?? null,
      infraEnabled: infra.enabled,
      infraRowStatus: infra.rowStatus,
      infraRowId: infra.row?.id ?? null,
      infraPerNodeGuideCpu: infra.perNodeGuideCpu,
      infraPerNodeGuideMemMiB: infra.perNodeGuideMemMiB,
      vmLogicalBytes: storage.vmLogicalBytes,
      physicalBytes: storage.physicalTotalBytes,
    },
  };
  return { result, errors, model };
}

function bootstrapSection(): Section {
  const mk = (id: string, label: string, text: string, ref: string): ResultItem => ({ id: `bootstrap.${id}`, label, kind: 'official_min', status: 'info', text, refs: [ref] });
  return {
    id: 'bootstrap',
    title: 'ブートストラップ（別枠）',
    items: [
      mk('count', '台数', `${off('installBootstrapCount')} 台（インストール後に削除できる）`, 'installBootstrapCount'),
      mk('cpu', 'CPU（1 台）', `${off('installBootstrapCpu')} vCPU`, 'installBootstrapCpu'),
      mk('ram', 'メモリ（1 台）', `${off('installBootstrapRam')} GB`, 'installBootstrapRam'),
      mk('disk', 'ストレージ（1 台）', `${off('installBootstrapDisk')} GB`, 'installBootstrapDisk'),
      mk('iops', 'IOPS（1 台）', `${off('installBootstrapIops')} IOPS`, 'installBootstrapIops'),
    ],
  };
}

function platformSection(model: SizingModel): Section {
  return {
    id: 'platform',
    title: '配置プラットフォームと CPU 要件',
    items: [
      {
        id: 'platform.value',
        label: '配置プラットフォーム（記録）',
        kind: 'input',
        status: 'info',
        text: `${model.platform || '未入力'}${model.platformNote ? `（${model.platformNote}）` : ''}`,
        refs: ['platforms'],
        note: 'このアプリは個別プラットフォームのサポート可否を自動判定しない。公式資料で確認する',
      },
      {
        id: 'platform.scope',
        label: '適用範囲',
        kind: 'assumption',
        status: 'info',
        text: 'コントロールプレーン・コンピュート・インフラを分けた通常のマルチノード構成が対象。SNO、コンパクトクラスタ、Hosted Control Planes、ODF 自体の構成設計は適用範囲外',
      },
    ],
  };
}

function assumptions(model: SizingModel, used1to1: boolean): Assumption[] {
  const out: Assumption[] = [];
  if (model.isSample) out.push({ kind: 'sample', text: '入力値はサンプル値です。実案件の値に置き換えてください。' });
  model.extraAssumptions.forEach((text) => out.push({ kind: 'assumption', text }));
  model.vms.filter((v) => v.runningLinked).forEach((v) => out.push({ kind: 'assumption', text: `VM「${v.name}」の最大同時稼働台数は、初期値として定義台数と同数（${has(v.defined) ? fmt(v.defined.v) : '未入力'} 台）を設定しています。` }));
  out.push({ kind: 'assumption', text: 'VM プロファイルの新規行では、グラフィックスデバイス 1、SR-IOV 0、GPU 0、SEV・TPM 無効を初期値として表示しています（画面で変更できます）。' });
  out.push({ kind: 'assumption', text: 'メモリのオーバーコミットは前提としません。VM メモリ要求量 = ゲスト RAM + VM 追加メモリ。' });
  if (used1to1) out.push({ kind: 'assumption', text: 'CPU 割り当て比率が未入力の共有 CPU VM は、明示選択により 1 対 1 で計画しています。' });
  out.push({ kind: 'assumption', text: 'VM 1 台 = virt-launcher Pod 1 個として Pod 枠を数えます。' });
  out.push({ kind: 'assumption', text: '必要台数の配置は、同一仕様ノードへの簡易な分散配置です（NUMA・アフィニティ・特殊デバイスは扱わず、該当する場合は要個別評価）。コンピュートに置くサービスとインフラ分の要求量はノードへ均等に差し引きます。' });
  out.push({ kind: 'assumption', text: '公式試験表の参考点は、比較台数と Namespace 数の両方が収まる最小の行を選びます（補間・外挿なし）。' });
  out.push({
    kind: 'assumption',
    text: `試験表の比較台数：コントロールプレーンは「${basisText(model.cpWorkerBasis)}」、インフラは「${basisText(model.infraWorkerBasis)}」で集計しています（既定は、コントロールプレーン表の「コンピュート台数」はインフラを含まず、インフラ表の「Worker 台数」はインフラを含むという解釈。例：24 + 3 = 27）。`,
  });
  out.push({ kind: 'assumption', text: 'ネットワークプラグインは OVN-Kubernetes（4.22 の既定）を前提とします。' });
  if (model.infraEvenDistribution) out.push({ kind: 'assumption', text: 'インフラのサービス要求量と Virtualization 分をインフラノードへ均等に配分する計画として 1 台あたりを概算しています。' });
  if (!model.infraEnabled) out.push({ kind: 'assumption', text: 'インフラノードを使わない構成のため、インフラ向けサービスと Virtualization のインフラ分（4 コア・2,179 MiB）をコンピュートへ計上しています。' });
  out.push({ kind: 'assumption', text: 'ストレージの物理容量 = (論理容量 + スナップショット・増加量) × 物理容量係数 ÷ (1 − 空き容量比率) はこのツールの試算式です。' });
  return out;
}

function basisText(b: SizingModel['cpWorkerBasis']): string {
  return b === 'compute' ? 'コンピュート台数' : b === 'computePlusInfra' ? 'コンピュート + インフラ台数' : '手入力の台数';
}

const cell = (lines: (string | null | undefined | false)[], status?: Status): SummaryCell => ({ lines: lines.filter((l): l is string => !!l), status });

function find(items: ResultItem[], id: string): ResultItem | undefined {
  return items.find((i) => i.id === id);
}

function summary(model: SizingModel, totals: VmTotals, cp: CpCalc, compute: ComputeCalc, infra: InfraCalc, storage: StorageCalc, network: NetworkCalc): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const role = model.roles;
  const candDisk = (r: typeof role.compute) => (has(r.diskBytes) ? fmtBytes(r.diskBytes.v) : '未入力');
  const virtDisk = `${off('virtStoragePerNode')} GiB`;

  // コントロールプレーン
  const cpCount = cp.count ?? off('installCpCount');
  const cpCountItem = find(cp.items, 'cp.count');
  const cpScale = find(cp.items, 'cp.candVsRow');
  const memGB = cp.candidateMemMiB !== null ? (cp.candidateMemMiB * 2 ** 20) / GB : null;
  rows.push({
    role: 'コントロールプレーン',
    count: cell([`${fmt(cpCount)} 台`, `基準 ${off('installCpCount')} 台（公式最低要件）`], cpCountItem?.status),
    cpuPer: cell([`必要 ${fmt(cp.perNodeCpu)} コア`, cp.row ? `試験参考 ${cp.row.cpuCores}・最低 ${off('installCpCpu')}` : `最低 ${off('installCpCpu')}（試験参考は${STATUS_LABEL[cp.rowStatus]}）`, `候補 ${cp.candidateCpu !== null ? fmt(cp.candidateCpu) : '未入力'}`], cpScale?.status ?? find(cp.items, 'cp.install.cpu')?.status),
    cpuTotal: cell([`${fmt(cp.perNodeCpu * cpCount)} コア`, `（${fmt(cpCount)} 台 × 必要値）`]),
    memPer: cell([`必要 ${fmt(cp.perNodeMemGB)} GB`, `候補 ${memGB !== null ? `${fmt(memGB)} GB` : '未入力'}`], cpScale?.status ?? find(cp.items, 'cp.install.ram')?.status),
    memTotal: cell([`${fmt(cp.perNodeMemGB * cpCount)} GB`]),
    localPer: cell([`最低 ${off('installCpDisk')} GB`, `+ Virtualization ${virtDisk}`, `候補 ${candDisk(role.controlPlane)}`], find(cp.items, 'cp.install.disk')?.status),
    localTotal: cell([has(role.controlPlane.diskBytes) ? fmtBytes(role.controlPlane.diskBytes.v * cpCount) : '未算出']),
    shared: cell(['対象外（etcd はローカルディスク）'], 'na'),
    network: cell(['etcd p99 RTT < 50 ms', find(cp.items, 'cp.rtt')?.text ?? ''], find(cp.items, 'cp.rtt')?.status),
  });

  // コンピュート
  const req = find(compute.items, 'compute.required');
  const ccount = compute.evaluatedCount;
  rows.push({
    role: 'コンピュート',
    count: cell(
      [
        `必要 ${compute.required !== null ? `${fmt(compute.required)} 台` : STATUS_LABEL[compute.requiredStatus]}`,
        `候補 ${compute.candidate !== null ? `${fmt(compute.candidate)} 台` : '未入力'}`,
        compute.candidate !== null ? `候補の評価：${STATUS_LABEL[compute.candidateStatus]}` : null,
      ],
      compute.candidate !== null ? compute.candidateStatus : req?.status,
    ),
    cpuPer: cell([`VM 用 ${compute.vmCpuPerNode !== null ? `${fmt(compute.vmCpuPerNode)} コア` : '未算出'}`, `Allocatable ${compute.allocCpu !== null ? fmt(compute.allocCpu) : '未算出'}`, `候補 ${has(role.compute.cpu) ? fmt(role.compute.cpu.v) : '未入力'}`], compute.vmCpuPerNode === null ? 'not_calculated' : undefined),
    cpuTotal: cell([`要求量 ${compute.totalCpuDemand !== null ? `${fmt(compute.totalCpuDemand)} コア` : '未算出'}`, `総 vCPU ${totals.totalVcpu !== null ? fmt(totals.totalVcpu) : '未算出'}`, `ピーク ${totals.peak !== null ? `${fmt(totals.peak)} コア` : '未算出'}`], compute.totalCpuDemand === null ? 'not_calculated' : 'calculated'),
    memPer: cell([`VM 用 ${compute.vmMemPerNodeMiB !== null ? fmtMiB(compute.vmMemPerNodeMiB) : '未算出'}`, `候補 ${has(role.compute.ramMiB) ? fmtMiB(role.compute.ramMiB.v) : '未入力'}`], compute.vmMemPerNodeMiB === null ? 'not_calculated' : undefined),
    memTotal: cell([`要求量 ${compute.totalMemDemandMiB !== null ? fmtMiB(compute.totalMemDemandMiB) : '未算出'}`], compute.totalMemDemandMiB === null ? 'not_calculated' : 'calculated'),
    localPer: cell([`最低 ${off('installComputeDisk')} GB`, `+ Virtualization ${virtDisk}`, `候補 ${candDisk(role.compute)}`], find(compute.items, 'compute.install.disk')?.status),
    localTotal: cell([has(role.compute.diskBytes) && ccount !== null ? fmtBytes(role.compute.diskBytes.v * ccount) : '未算出', ccount !== null ? `（${fmt(ccount)} 台）` : null]),
    shared: cell([`VM 論理 ${storage.vmLogicalBytes !== null ? fmtBytes(storage.vmLogicalBytes) : '未算出'}`, `物理 ${storage.physicalTotalBytes !== null ? fmtBytes(storage.physicalTotalBytes) : '未算出'}`], storage.vmLogicalBytes === null ? 'not_calculated' : storage.physicalTotalBytes === null ? 'not_calculated' : storage.backends.some((x) => x.status === 'unconfirmed') ? 'unconfirmed' : 'calculated'),
    network: cell([`クラスタ 送信 ${network.clusterTxBps !== null ? fmtBps(network.clusterTxBps) : '未確認'}`, `受信 ${network.clusterRxBps !== null ? fmtBps(network.clusterRxBps) : '未確認'}`, `NIC 当たり：${STATUS_LABEL[network.nicStatus]}`], network.nicStatus),
  });

  // インフラ
  if (infra.enabled) {
    const memGBi = has(role.infra.ramMiB) ? (role.infra.ramMiB.v * 2 ** 20) / GB : null;
    const svcStorage = storage.items.filter((i) => i.id.endsWith('.svcLogical'));
    rows.push({
      role: 'インフラ',
      count: cell([infra.count !== null ? `${fmt(infra.count)} 台` : '未入力', `一般推奨 ${off('infraRecommendedCount')} 台`], find(infra.items, 'infra.count')?.status),
      cpuPer: cell([infra.row ? `試験参考 ${infra.row.cpuCores} コア` : `試験参考：${STATUS_LABEL[infra.rowStatus]}`, infra.perNodeGuideCpu !== null ? `目安 ${fmt(infra.perNodeGuideCpu)} コア（均等配分）` : null, `候補 ${has(role.infra.cpu) ? fmt(role.infra.cpu.v) : '未入力'}`], find(infra.items, 'infra.candVsRow')?.status ?? infra.rowStatus),
      cpuTotal: cell([`積み上げ ${infra.stackCpu !== null ? `${fmt(infra.stackCpu)} コア` : '未算出'}`, `（うち Virtualization ${infra.virtCpuTotal} コア）`], infra.stackStatus),
      memPer: cell([infra.row ? `試験参考 ${infra.row.memoryGB} GB` : `試験参考：${STATUS_LABEL[infra.rowStatus]}`, infra.perNodeGuideMemMiB !== null ? `目安 ${fmtMiB(infra.perNodeGuideMemMiB)}` : null, `候補 ${memGBi !== null ? `${fmt(memGBi)} GB` : '未入力'}`], find(infra.items, 'infra.candVsRow')?.status ?? infra.rowStatus),
      memTotal: cell([`積み上げ ${infra.stackMemMiB !== null ? fmtMiB(infra.stackMemMiB) : '未算出'}`, infra.virtMemTotalMiB !== null ? `（うち Virtualization ${fmt(infra.virtMemTotalMiB)} MiB）` : null], infra.stackStatus),
      localPer: cell([`+ Virtualization ${virtDisk}`, `候補 ${candDisk(role.infra)}`, '専用の公式最低値なし']),
      localTotal: cell([has(role.infra.diskBytes) && infra.count !== null ? fmtBytes(role.infra.diskBytes.v * infra.count) : '未算出']),
      shared: cell(svcStorage.length ? svcStorage.map((i) => `サービス保存量 ${i.value !== undefined ? fmtBytes(i.value) : '未算出'}`) : ['サービス保存量：対象なし']),
      network: cell([`Ingress ピーク ${svcIngress(model)}`, 'NIC 当たりは配分が分かる場合のみ評価'], 'unconfirmed'),
    });
  } else {
    rows.push({
      role: 'インフラ',
      count: cell(['対象外（インフラノードなし）'], 'na'),
      cpuPer: cell(['—'], 'na'),
      cpuTotal: cell(['コンピュートへ計上'], 'na'),
      memPer: cell(['—'], 'na'),
      memTotal: cell(['コンピュートへ計上'], 'na'),
      localPer: cell(['—'], 'na'),
      localTotal: cell(['—'], 'na'),
      shared: cell(['—'], 'na'),
      network: cell(['—'], 'na'),
    });
  }

  // ブートストラップ
  rows.push({
    role: 'ブートストラップ（一時）',
    count: cell([`${off('installBootstrapCount')} 台（インストール時）`], 'info'),
    cpuPer: cell([`${off('installBootstrapCpu')} vCPU`]),
    cpuTotal: cell([`${off('installBootstrapCpu')} vCPU`]),
    memPer: cell([`${off('installBootstrapRam')} GB`]),
    memTotal: cell([`${off('installBootstrapRam')} GB`]),
    localPer: cell([`${off('installBootstrapDisk')} GB・${off('installBootstrapIops')} IOPS`]),
    localTotal: cell([`${off('installBootstrapDisk')} GB`]),
    shared: cell(['—']),
    network: cell(['—']),
  });
  return rows;
}

function svcIngress(model: SizingModel): string {
  const ing = model.services.filter((s) => s.kind === 'ingress' && s.placement !== 'none');
  const known = ing.filter((s) => has(s.peakBps));
  if (!ing.length) return '対象なし';
  if (known.length !== ing.length) return '未確認';
  return fmtBps(known.reduce((a, s) => a + (s.peakBps as { v: number }).v, 0));
}

function openItems(groups: SizingResult['groups']): OpenItem[] {
  const out: OpenItem[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    for (const s of g.sections) {
      for (const it of s.items) {
        if (!['not_calculated', 'unconfirmed', 'individual', 'ng'].includes(it.status)) continue;
        const key = `${g.id}:${it.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          groupId: g.id,
          itemId: it.id,
          sectionTitle: `${g.title} › ${s.title}`,
          label: it.label,
          status: it.status,
          detail: it.missing?.length ? `不足・確認：${[...new Set(it.missing)].join('、')}` : it.text ?? it.note ?? '',
        });
      }
    }
  }
  const order: Status[] = ['ng', 'individual', 'not_calculated', 'unconfirmed'];
  return out.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}

function usedRefs(groups: SizingResult['groups']): string[] {
  const set = new Set<string>();
  for (const g of groups) for (const s of g.sections) for (const it of s.items) (it.refs ?? []).forEach((r) => set.add(r));
  return [...set].sort();
}

/** 使用した出典資料の ID（重複なし） */
export function usedSourceIds(result: SizingResult): SourceId[] {
  const ids = new Set<SourceId>();
  result.usedRefs.forEach((r) => {
    const x = resolveRef(r);
    if (x) ids.add(x.sourceId);
  });
  return (Object.keys(SOURCES) as SourceId[]).filter((k) => ids.has(k));
}
