// ゲスト VM の CPU・メモリ・ディスクの計算。
import { has, type SizingModel, type VmN } from '../parse';
import { fmt, fmtBytes, fmtMiB, type ResultItem, type Status } from '../result';
import { b, need, nvText, off, sum, T } from './helpers';

/** VM 1 台のメモリ追加負荷（MiB）。VIRT-INSTALL §4.2.4.1 */
export function vmMemOverheadMiB(p: {
  ramMiB: number;
  vcpu: number;
  graphics: number;
  sriov: number;
  gpu: number;
  sev: boolean;
  tpm: boolean;
}): number {
  return (
    off('vmMemOverheadFactor') * p.ramMiB +
    off('vmMemOverheadBase') +
    off('vmMemOverheadPerVcpu') * p.vcpu +
    off('vmMemOverheadPerGraphics') * p.graphics +
    off('vmMemOverheadPerDevice') * (p.sriov + p.gpu) +
    off('vmMemOverheadSev') * (p.sev ? 1 : 0) +
    off('vmMemOverheadTpm') * (p.tpm ? 1 : 0)
  );
}

export const MEM_OVERHEAD_FORMULA =
  '追加メモリ(MiB) = 0.002 × 要求メモリ + 218 + 8 × vCPU 数 + 16 × グラフィックスデバイス数 + 1024 × (SR-IOV デバイス数 + GPU 数) + 256 × SEV + 53 × TPM';

export const MEM_REFS = [
  'vmMemOverheadFactor',
  'vmMemOverheadBase',
  'vmMemOverheadPerVcpu',
  'vmMemOverheadPerGraphics',
  'vmMemOverheadPerDevice',
  'vmMemOverheadSev',
  'vmMemOverheadTpm',
];

export interface CpuRequest {
  /** VM 1 台の Pod CPU 要求量（コア） */
  value: number | null;
  kind: 'derived' | 'assumption';
  formula: string;
  missing: string[];
  note?: string;
}

/** VM 1 台の CPU 要求量。VIRT-VM §8.18.14、VIRT-INSTALL §4.2.4.2 */
export function vmCpuRequest(vm: VmN, plan1to1: boolean): CpuRequest {
  const missing: string[] = [];
  const vcpu = need(vm.vcpu, 'vCPU', missing);
  const extra = has(vm.extraCpu) ? vm.extraCpu.v : 0;
  const extraNote = has(vm.extraCpu) ? '' : '（追加 CPU 要求量は未設定のため含めていません）';
  if (vcpu === null) return { value: null, kind: 'derived', formula: '', missing };
  if (vm.cpuMode === 'dedicated') {
    return { value: vcpu + extra, kind: 'derived', formula: `専用 CPU：vCPU（1 対 1）+ 追加 CPU = ${fmt(vcpu)} + ${fmt(extra)}${extraNote}`, missing };
  }
  if (has(vm.ratio)) {
    return {
      value: vcpu / vm.ratio.v + extra,
      kind: 'derived',
      formula: `共有 CPU：vCPU ÷ vmiCPUAllocationRatio + 追加 CPU = ${fmt(vcpu)} ÷ ${fmt(vm.ratio.v)} + ${fmt(extra)}${extraNote}`,
      missing,
    };
  }
  if (plan1to1) {
    return {
      value: vcpu + extra,
      kind: 'assumption',
      formula: `共有 CPU・比率未入力：明示選択した 1 対 1 の計画値 = ${fmt(vcpu)} + ${fmt(extra)}${extraNote}`,
      missing,
      note: '比率が未入力のため、明示的に選択した 1 対 1 の計画値を使用（このアプリの仮定）',
    };
  }
  missing.push('CPU 割り当て比率（vmiCPUAllocationRatio）、または「1 対 1 で計画」の選択');
  return { value: null, kind: 'derived', formula: '', missing };
}

export interface VmCalc {
  id: string;
  name: string;
  defined: number | null;
  running: number | null;
  vcpu: number | null;
  cpuReq: CpuRequest;
  peakPerVm: number | null;
  memOverheadMiB: number | null;
  memPerVmMiB: number | null;
  diskBytes: number | null;
  /** NUMA・特殊デバイス等、簡易配置で扱えない制約 */
  special: boolean;
  dedicated: boolean;
  items: ResultItem[];
}

export function calcVm(vm: VmN, model: SizingModel): VmCalc {
  const items: ResultItem[] = [];
  const id = (s: string) => `vm.${vm.id}.${s}`;
  const mDefined: string[] = [];
  const defined = need(vm.defined, '定義台数', mDefined);
  const mRun: string[] = [];
  const running = need(vm.running, '最大同時稼働台数', mRun);
  const vcpu = has(vm.vcpu) ? vm.vcpu.v : null;

  items.push({
    id: id('running'),
    label: '最大同時稼働台数（CPU・メモリの集計に使用）',
    kind: vm.runningLinked ? 'assumption' : 'input',
    status: running === null ? 'not_calculated' : 'calculated',
    value: running ?? undefined,
    unit: 'count',
    text: running !== null ? '台' : undefined,
    note: vm.runningLinked ? '初期値として定義台数と同数を設定（前提）' : undefined,
    missing: mRun.length ? mRun : undefined,
  });

  // 総 vCPU
  const mV: string[] = [];
  const v = need(vm.vcpu, 'vCPU', mV);
  items.push({
    id: id('totalVcpu'),
    label: '総割り当て vCPU',
    kind: 'derived',
    status: running !== null && v !== null ? 'calculated' : 'not_calculated',
    value: running !== null && v !== null ? running * v : undefined,
    unit: 'vcpu',
    formula: '最大同時稼働台数 × vCPU',
    basis: [b('最大同時稼働台数', nvText(vm.running)), b('vCPU', T.num(vm.vcpu))],
    missing: [...mRun, ...mV].length ? [...mRun, ...mV] : undefined,
  });

  // CPU 要求量
  const cpuReq = vmCpuRequest(vm, model.plan1to1);
  items.push({
    id: id('cpuReq'),
    label: vm.cpuMode === 'dedicated' ? 'Pod CPU 要求量（専用 CPU、1 台あたり）' : 'Pod CPU 要求量（共有 CPU、1 台あたり）',
    kind: cpuReq.kind,
    status: cpuReq.value === null ? 'not_calculated' : 'calculated',
    value: cpuReq.value ?? undefined,
    unit: 'cores',
    formula: cpuReq.formula || undefined,
    refs: vm.cpuMode === 'dedicated' ? ['cpuAllocationRatio', 'VIRT-INSTALL'] : ['cpuAllocationRatio'],
    missing: cpuReq.missing.length ? cpuReq.missing : undefined,
    note: cpuReq.note,
  });
  items.push({
    id: id('cpuReqTotal'),
    label: 'Pod CPU 要求量（プロファイル合計）',
    kind: cpuReq.kind,
    status: cpuReq.value !== null && running !== null ? 'calculated' : 'not_calculated',
    value: cpuReq.value !== null && running !== null ? cpuReq.value * running : undefined,
    unit: 'cores',
    formula: '1 台あたりの Pod CPU 要求量 × 最大同時稼働台数',
    missing: [...mRun, ...cpuReq.missing].length ? [...mRun, ...cpuReq.missing] : undefined,
  });

  // ピーク CPU
  const mP: string[] = [];
  let peakPerVm: number | null = null;
  if (vm.peakCpuMode === 'cores') {
    peakPerVm = need(vm.peakCpu, '実測 CPU（コア）', mP);
  } else {
    const pct = need(vm.peakCpu, 'ピーク CPU 使用率', mP);
    if (pct !== null && v !== null) peakPerVm = (v * pct) / 100;
  }
  items.push({
    id: id('peakTotal'),
    label: 'ピーク処理に必要な CPU（プロファイル合計）',
    kind: vm.peakCpuMode === 'cores' ? 'measured' : 'derived',
    status: peakPerVm !== null && running !== null ? 'calculated' : 'not_calculated',
    value: peakPerVm !== null && running !== null ? peakPerVm * running : undefined,
    unit: 'cores',
    formula: vm.peakCpuMode === 'cores' ? '実測 CPU（1 台）× 最大同時稼働台数' : 'vCPU × ピーク CPU 使用率 × 最大同時稼働台数',
    basis: [b(vm.peakCpuMode === 'cores' ? '実測 CPU（コア）' : 'ピーク CPU 使用率（%）', T.num(vm.peakCpu))],
    note: 'Pod CPU 要求量とは別の見積もり（スケジューリングには要求量を使う）',
    missing: [...mRun, ...mP].length ? [...mRun, ...mP] : undefined,
  });

  // メモリ
  const mM: string[] = [];
  const ram = need(vm.ramMiB, 'ゲスト RAM', mM);
  const vcpuM = need(vm.vcpu, 'vCPU', mM);
  const g = need(vm.graphics, 'グラフィックスデバイス数', mM);
  const s = need(vm.sriov, 'SR-IOV デバイス数', mM);
  const gp = need(vm.gpu, 'GPU 数', mM);
  let memOverheadMiB: number | null = null;
  let memPerVmMiB: number | null = null;
  if (ram !== null && vcpuM !== null && g !== null && s !== null && gp !== null) {
    memOverheadMiB = vmMemOverheadMiB({ ramMiB: ram, vcpu: vcpuM, graphics: g, sriov: s, gpu: gp, sev: vm.sev, tpm: vm.tpm });
    memPerVmMiB = ram + memOverheadMiB;
  }
  const memBasis = [
    b('ゲスト RAM（要求メモリ）', T.mib(vm.ramMiB)),
    b('vCPU', T.num(vm.vcpu)),
    b('グラフィックスデバイス数', T.num(vm.graphics)),
    b('SR-IOV デバイス数', T.num(vm.sriov)),
    b('GPU 数', T.num(vm.gpu)),
    b('SEV', vm.sev ? '有効（1）' : '無効（0）'),
    b('TPM', vm.tpm ? '有効（1）' : '無効（0）'),
  ];
  items.push({
    id: id('memOverhead'),
    label: 'VM 追加メモリ（1 台あたり）',
    kind: 'derived',
    status: memOverheadMiB === null ? 'not_calculated' : 'calculated',
    value: memOverheadMiB ?? undefined,
    unit: 'mib',
    formula: MEM_OVERHEAD_FORMULA,
    basis: memBasis,
    refs: MEM_REFS,
    missing: mM.length ? mM : undefined,
  });
  items.push({
    id: id('memPerVm'),
    label: 'VM メモリ要求量（1 台あたり）',
    kind: 'derived',
    status: memPerVmMiB === null ? 'not_calculated' : 'calculated',
    value: memPerVmMiB ?? undefined,
    unit: 'mib',
    formula: 'ゲスト RAM + VM 追加メモリ（メモリのオーバーコミットは前提としない）',
    refs: MEM_REFS,
    missing: mM.length ? mM : undefined,
  });
  items.push({
    id: id('memTotal'),
    label: 'VM メモリ要求量（プロファイル合計）',
    kind: 'derived',
    status: memPerVmMiB !== null && running !== null ? 'calculated' : 'not_calculated',
    value: memPerVmMiB !== null && running !== null ? memPerVmMiB * running : undefined,
    unit: 'mib',
    formula: 'VM メモリ要求量（1 台）× 最大同時稼働台数',
    basis: [b('VM メモリ要求量（1 台）', memPerVmMiB !== null ? fmtMiB(memPerVmMiB) : '未算出'), b('最大同時稼働台数', nvText(vm.running))],
    missing: [...mRun, ...mM].length ? [...mRun, ...mM] : undefined,
  });

  // ディスク
  const mD: string[] = [];
  const disk = need(vm.diskBytes, 'ディスクの合計論理容量', mD);
  items.push({
    id: id('diskTotal'),
    label: '永続ディスクの論理容量（プロファイル合計）',
    kind: 'derived',
    status: disk !== null && defined !== null ? 'calculated' : vm.diskBytes.k === 'na' ? 'na' : 'not_calculated',
    value: disk !== null && defined !== null ? disk * defined : undefined,
    unit: 'bytes',
    formula: '定義台数 × 1 台あたりの永続ディスク論理容量（停止中の VM もディスクを確保する前提）',
    basis: [b('定義台数', nvText(vm.defined)), b('1 台あたり', disk !== null ? fmtBytes(disk) : nvText(vm.diskBytes))],
    refs: ['VIRT-INSTALL'],
    missing: [...mDefined, ...mD].length && vm.diskBytes.k !== 'na' ? [...mDefined, ...mD] : undefined,
  });

  // 試験上限
  const limitIssues: string[] = [];
  if (vcpu !== null && vcpu > off('limitVmVcpu')) limitIssues.push(`vCPU ${fmt(vcpu)} が試験上限 ${off('limitVmVcpu')} vCPU を超えています`);
  if (ram !== null && ram * 2 ** 20 > off('limitVmMemory') * 1e12) limitIssues.push(`ゲスト RAM が試験上限 ${off('limitVmMemory')} TB を超えています`);
  if (ram !== null && ram * 2 ** 20 < off('limitVmMinMemory') * 1e6) limitIssues.push(`ゲスト RAM が最小 ${off('limitVmMinMemory')} MB を下回っています`);
  const limitStatus: Status = vcpu === null || ram === null ? 'not_calculated' : limitIssues.length ? 'individual' : 'ok';
  items.push({
    id: id('limits'),
    label: 'VM の試験上限との照合',
    kind: 'official_rec',
    status: limitStatus,
    text: limitIssues.length ? limitIssues.join('。') : limitStatus === 'ok' ? '試験上限内（255 vCPU、6 TB、最小 512 MB）' : undefined,
    refs: ['limitVmVcpu', 'limitVmMemory', 'limitVmMinMemory'],
  });

  const special = (has(vm.sriov) && vm.sriov.v > 0) || (has(vm.gpu) && vm.gpu.v > 0);

  return {
    id: vm.id,
    name: vm.name,
    defined,
    running,
    vcpu,
    cpuReq,
    peakPerVm,
    memOverheadMiB,
    memPerVmMiB,
    diskBytes: disk,
    special,
    dedicated: vm.cpuMode === 'dedicated',
    items,
  };
}

export interface VmTotals {
  totalVcpu: number | null;
  cpuReq: number | null;
  peak: number | null;
  memMiB: number | null;
  diskBytes: number | null;
  running: number | null;
  defined: number | null;
  items: ResultItem[];
}

function total(
  calcs: VmCalc[],
  pick: (c: VmCalc) => number | null,
): { value: number | null; partial: number; missingNames: string[] } {
  const missingNames: string[] = [];
  const vals: number[] = [];
  for (const c of calcs) {
    const v = pick(c);
    if (v === null) missingNames.push(c.name);
    else vals.push(v);
  }
  return { value: missingNames.length ? null : sum(vals), partial: sum(vals), missingNames };
}

export function calcVmTotals(calcs: VmCalc[]): VmTotals {
  const mk = (
    idSuffix: string,
    label: string,
    unit: ResultItem['unit'],
    t: ReturnType<typeof total>,
    formula: string,
    extra: Partial<ResultItem> = {},
  ): ResultItem => ({
    id: `vmTotal.${idSuffix}`,
    label,
    kind: 'derived',
    status: t.value === null ? 'not_calculated' : 'calculated',
    value: t.value ?? undefined,
    unit,
    formula,
    missing: t.missingNames.length ? t.missingNames.map((n) => `VM「${n}」の関連入力`) : undefined,
    note: t.value === null && t.partial > 0 ? `入力済みプロファイルのみの部分合計: ${unit ? fmtPartial(t.partial, unit) : t.partial}` : undefined,
    ...extra,
  });
  const tv = total(calcs, (c) => (c.running !== null && c.vcpu !== null ? c.running * c.vcpu : null));
  const tc = total(calcs, (c) => (c.running !== null && c.cpuReq.value !== null ? c.running * c.cpuReq.value : null));
  const tp = total(calcs, (c) => (c.running !== null && c.peakPerVm !== null ? c.running * c.peakPerVm : null));
  const tm = total(calcs, (c) => (c.running !== null && c.memPerVmMiB !== null ? c.running * c.memPerVmMiB : null));
  const td = total(calcs, (c) => (c.defined !== null && c.diskBytes !== null ? c.defined * c.diskBytes : null));
  const tr = total(calcs, (c) => c.running);
  const tdef = total(calcs, (c) => c.defined);
  const anyAssumption = calcs.some((c) => c.cpuReq.kind === 'assumption');
  const items: ResultItem[] = [
    mk('defined', '定義台数（合計）', 'count', tdef, 'Σ 定義台数'),
    mk('running', '最大同時稼働台数（合計）', 'count', tr, 'Σ 最大同時稼働台数'),
    mk('vcpu', '総割り当て vCPU', 'vcpu', tv, 'Σ（最大同時稼働台数 × vCPU）'),
    mk('cpuReq', 'VM の Pod CPU 要求量（合計）', 'cores', tc, 'Σ（最大同時稼働台数 × 1 台の Pod CPU 要求量）', {
      kind: anyAssumption ? 'assumption' : 'derived',
      refs: ['cpuAllocationRatio'],
    }),
    mk('peak', 'ピーク処理に必要な CPU（合計）', 'cores', tp, 'Σ（最大同時稼働台数 × 1 台のピーク CPU）'),
    mk('mem', 'VM メモリ要求量（合計）', 'mib', tm, 'Σ（最大同時稼働台数 × (ゲスト RAM + VM 追加メモリ)）', { refs: MEM_REFS }),
    mk('disk', '永続ディスクの論理容量（合計）', 'bytes', td, 'Σ（定義台数 × 1 台あたりの永続ディスク論理容量）', { refs: ['VIRT-INSTALL'] }),
  ];
  return {
    totalVcpu: tv.value,
    cpuReq: tc.value,
    peak: tp.value,
    memMiB: tm.value,
    diskBytes: td.value,
    running: tr.value,
    defined: tdef.value,
    items,
  };
}

function fmtPartial(v: number, unit: NonNullable<ResultItem['unit']>): string {
  if (unit === 'mib') return fmtMiB(v);
  if (unit === 'bytes') return fmtBytes(v);
  return fmt(v);
}
