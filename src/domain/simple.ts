// 簡易版の入力モデルと、詳細版の入力モデルへの変換（純粋関数）。
// 簡易版で尋ねない値は「簡易版の仮定値」として明示し、結果の前提に表示する。
import { emptyBackend, emptyInput, emptyVm, newId, type Qty, type SizingInput } from './types';
import type { Diagnosis } from '../network/data/types';
import { patterns } from '../network/data/patterns';
import { CAPACITY_UNITS, MEMORY_UNITS, isUnit, type CapacityUnit, type MemoryUnit } from './units';

export const CPU_RATIO_OPTIONS = ['1', '2', '4', '8', '10'] as const;
export type CpuRatio = (typeof CPU_RATIO_OPTIONS)[number];

export const TOLERANCE_OPTIONS = ['0', '1', '2'] as const;
export type Tolerance = (typeof TOLERANCE_OPTIONS)[number];

export interface SimpleVm {
  id: string;
  name: string;
  count: string;
  vcpu: string;
  ram: Qty<MemoryUnit>;
  disk: Qty<CapacityUnit>;
}

export interface SimpleInput {
  projectName: string;
  vms: SimpleVm[];
  /** VM を稼働させる物理サーバ（コンピュートノード） */
  servers: { count: string; cpu: string; ram: Qty<MemoryUnit> };
  /** CPU 割り当て比率（全 VM 共通） */
  cpuRatio: CpuRatio;
  /** 停止・メンテナンスを許容する台数 */
  tolerance: Tolerance;
  infra: 'separate' | 'none';
  namespaces: string;
  /** 共有ストレージの物理容量係数（任意） */
  storageFactor: string;
  /** 簡易版の仮定値（画面で変更可能） */
  assumptions: {
    residentCpu: string;
    residentMem: Qty<MemoryUnit>;
    evictionMem: Qty<MemoryUnit>;
  };
  /** SR-IOV を使う VM（ネットワーク診断の例外枠 F と連携） */
  sriov: { vmIds: string[]; devicesPerVm: SriovDevices };
  isSample: boolean;
}

export const SRIOV_DEVICE_OPTIONS = ['1', '2', '3', '4'] as const;
export type SriovDevices = (typeof SRIOV_DEVICE_OPTIONS)[number];

/** 簡易版の仮定値の初期値（このアプリの仮定。公式値ではない） */
export const SIMPLE_DEFAULT_ASSUMPTIONS: SimpleInput['assumptions'] = {
  residentCpu: '1',
  residentMem: { raw: '4', unit: 'GiB' },
  // OCP-NODES §6.12.1.4 の説明で例として使われている値
  evictionMem: { raw: '100', unit: 'MiB' },
};

export const SIMPLE_BACKEND_ID = 'simple-storage';

export function emptySimpleVm(id = newId('vm')): SimpleVm {
  return { id, name: '', count: '', vcpu: '', ram: { raw: '', unit: 'GiB' }, disk: { raw: '', unit: 'GiB' } };
}

export function emptySimple(): SimpleInput {
  return {
    projectName: '',
    vms: [],
    servers: { count: '', cpu: '', ram: { raw: '', unit: 'GiB' } },
    cpuRatio: '1',
    tolerance: '1',
    infra: 'separate',
    namespaces: '',
    storageFactor: '',
    assumptions: structuredClone(SIMPLE_DEFAULT_ASSUMPTIONS),
    sriov: { vmIds: [], devicesPerVm: '1' },
    isSample: false,
  };
}

export function sampleSimple(): SimpleInput {
  return {
    projectName: 'サンプル案件：簡易見積もり',
    vms: [
      { id: 'preset-s', name: 'S（2 vCPU・4 GiB）', count: '30', vcpu: '2', ram: { raw: '4', unit: 'GiB' }, disk: { raw: '60', unit: 'GiB' } },
      { id: 'preset-m', name: 'M（4 vCPU・16 GiB）', count: '20', vcpu: '4', ram: { raw: '16', unit: 'GiB' }, disk: { raw: '120', unit: 'GiB' } },
      { id: 'svm-db', name: 'データベース', count: '6', vcpu: '8', ram: { raw: '64', unit: 'GiB' }, disk: { raw: '500', unit: 'GiB' } },
    ],
    servers: { count: '5', cpu: '64', ram: { raw: '512', unit: 'GiB' } },
    cpuRatio: '4',
    tolerance: '1',
    infra: 'separate',
    namespaces: '50',
    storageFactor: '3',
    assumptions: structuredClone(SIMPLE_DEFAULT_ASSUMPTIONS),
    sriov: { vmIds: [], devicesPerVm: '1' },
    isSample: true,
  };
}

const q = (x: Qty<string>) => (x.raw.trim() ? `${x.raw} ${x.unit}` : '未入力');

/** 簡易版の入力から詳細版の入力モデルを組み立てる。ネットワーク診断の結果があれば前提に加える */
export function simpleToSizingInput(s: SimpleInput, network?: Diagnosis | null): SizingInput {
  const x = emptyInput();
  x.isSample = s.isSample;
  x.cluster.projectName = s.projectName;
  x.cluster.namespaces = s.namespaces;
  x.cluster.infraEnabled = s.infra === 'separate';
  x.cluster.infraEvenDistribution = s.infra === 'separate';

  const useBackend = s.storageFactor.trim() !== '';
  if (useBackend) x.backends = [{ ...emptyBackend(SIMPLE_BACKEND_ID), name: '共有ストレージ', factor: s.storageFactor }];

  x.vms = s.vms.map((v) => ({
    ...emptyVm(v.id),
    name: v.name,
    definedCount: v.count,
    runningCount: v.count,
    runningLinked: true,
    vcpu: v.vcpu,
    ram: { ...v.ram },
    disk: { ...v.disk },
    cpuMode: 'shared',
    allocationRatio: s.cpuRatio,
    sriov: s.sriov.vmIds.includes(v.id) ? s.sriov.devicesPerVm : '0',
    backendId: useBackend ? SIMPLE_BACKEND_ID : '',
  }));

  x.roles.compute = {
    ...x.roles.compute,
    count: s.servers.count,
    cpu: s.servers.cpu,
    ram: { ...s.servers.ram },
    autoSysReserved: true,
    evictionMem: { ...s.assumptions.evictionMem },
    residentCpu: s.assumptions.residentCpu,
    residentMem: { ...s.assumptions.residentMem },
    residentIncludesVirt: false,
    unavailable: s.tolerance,
  };
  x.roles.controlPlane.count = '3';
  x.roles.infra.count = '3';
  x.services = [];
  x.availability.computeDrain = s.tolerance;

  x.extraAssumptions = [
    '簡易版の入力から計算しています。入力していない項目（ネットワーク、ストレージ性能、監視などのサービス要求量、実測値）は計算に含めず、未確認として扱います。詳細版で入力できます。',
    `CPU 割り当て比率は全 VM 共通で ${s.cpuRatio}:1（${s.cpuRatio === '1' ? 'オーバーコミットなし' : 'CPU オーバーコミットあり'}）として Pod CPU 要求量を求めています。`,
    `VM 用サーバ 1 台あたりの常駐 Pod の要求量を CPU ${s.assumptions.residentCpu || '未入力'} コア・メモリ ${q(s.assumptions.residentMem)} と仮定しています（簡易版の仮定値。実測値があれば置き換えてください）。`,
    `ハード Eviction しきい値（メモリ）を ${q(s.assumptions.evictionMem)} としています（OCP-NODES §6.12.1.4 の説明に例として出てくる値を、簡易版の仮定値として使用）。システム予約は公式の自動計算式で求めます。`,
    `停止・メンテナンスを許容する台数 ${s.tolerance} 台を、障害時の残存容量の評価と、ライブマイグレーション用予備メモリの同時 drain ノード数の両方に使っています（2 つは別シナリオとして評価）。`,
    s.infra === 'separate'
      ? 'コントロールプレーン 3 台とインフラノード 3 台を VM 用サーバとは別に用意する前提です。インフラサービスの要求量は個別に見積もらず、公式試験の参考サイズで表示します。'
      : 'コントロールプレーン 3 台を VM 用サーバとは別に用意し、インフラノードは使わない前提です。Virtualization のインフラ分（4 コア・2,179 MiB）を VM 用サーバへ計上します。監視・Ingress などのサービス要求量は含みません。',
    useBackend ? `共有ストレージの物理容量係数は ${s.storageFactor} です（スナップショット・空き容量は含めません）。` : '共有ストレージの物理容量係数が未入力のため、物理容量は未算出です。',
  ];
  const sriovVms = s.vms.filter((v) => s.sriov.vmIds.includes(v.id));
  if (sriovVms.length) {
    x.extraAssumptions.push(
      `SR-IOV デバイスを VM 1 台あたり ${s.sriov.devicesPerVm} 個、${sriovVms.map((v) => `「${v.name || 'VM'}」`).join('、')}に割り当てて VM の追加メモリを計算しています（特殊デバイスのため配置は要個別評価）。`,
    );
  }
  if (network) {
    const p = patterns[network.primary];
    x.extraAssumptions.push(
      `ネットワーク構成は「パターン ${p.id}: ${p.shortName}」と診断済みです${network.modifiers.includes('E') ? '（マルチホームあり）' : ''}${network.exceptionNote === 'F' ? '（SR-IOV を例外枠として検討）' : ''}。帯域や NIC の割り当ては簡易版では計算しません。`,
    );
  }
  return x;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 簡易版の入力を JSON から復元する。形式が不正なら null */
export function parseSimple(v: unknown): SimpleInput | null {
  if (!isObj(v)) return null;
  const str = (o: Obj, k: string) => (typeof o[k] === 'string' ? (o[k] as string) : typeof o[k] === 'number' ? String(o[k]) : o[k] === undefined ? '' : null);
  const qty = <U extends string>(o: unknown, units: readonly U[]): Qty<U> | null => {
    if (!isObj(o)) return null;
    const raw = str(o, 'raw');
    if (raw === null || !isUnit(units, o.unit)) return null;
    return { raw, unit: o.unit as U };
  };
  const d = emptySimple();
  const projectName = str(v, 'projectName');
  const namespaces = str(v, 'namespaces');
  const storageFactor = str(v, 'storageFactor');
  if (projectName === null || namespaces === null || storageFactor === null) return null;
  if (!Array.isArray(v.vms)) return null;
  const vms: SimpleVm[] = [];
  for (const [i, x] of (v.vms as unknown[]).entries()) {
    if (!isObj(x)) return null;
    const name = str(x, 'name');
    const count = str(x, 'count');
    const vcpu = str(x, 'vcpu');
    const ram = qty(x.ram, MEMORY_UNITS);
    const disk = qty(x.disk, CAPACITY_UNITS);
    if (name === null || count === null || vcpu === null || !ram || !disk) return null;
    vms.push({ id: str(x, 'id') || `svm-import-${i}`, name, count, vcpu, ram, disk });
  }
  if (new Set(vms.map((x) => x.id)).size !== vms.length) return null;
  const sv = isObj(v.servers) ? v.servers : null;
  if (!sv) return null;
  const sc = str(sv, 'count');
  const scpu = str(sv, 'cpu');
  const sram = qty(sv.ram, MEMORY_UNITS);
  if (sc === null || scpu === null || !sram) return null;
  const a = isObj(v.assumptions) ? v.assumptions : {};
  const rc = str(a, 'residentCpu');
  const rm = a.residentMem === undefined ? d.assumptions.residentMem : qty(a.residentMem, MEMORY_UNITS);
  const ev = a.evictionMem === undefined ? d.assumptions.evictionMem : qty(a.evictionMem, MEMORY_UNITS);
  if (rc === null || !rm || !ev) return null;
  const ratio = v.cpuRatio === undefined ? d.cpuRatio : v.cpuRatio;
  const tol = v.tolerance === undefined ? d.tolerance : v.tolerance;
  const infra = v.infra === undefined ? d.infra : v.infra;
  if (!isUnit(CPU_RATIO_OPTIONS, ratio) || !isUnit(TOLERANCE_OPTIONS, tol) || (infra !== 'separate' && infra !== 'none')) return null;
  let sriov: SimpleInput['sriov'] = { vmIds: [], devicesPerVm: '1' };
  if (v.sriov !== undefined) {
    if (!isObj(v.sriov) || !Array.isArray(v.sriov.vmIds) || !v.sriov.vmIds.every((x) => typeof x === 'string') || !isUnit(SRIOV_DEVICE_OPTIONS, v.sriov.devicesPerVm)) return null;
    sriov = { vmIds: (v.sriov.vmIds as string[]).filter((id) => vms.some((x) => x.id === id)), devicesPerVm: v.sriov.devicesPerVm as SriovDevices };
  }
  return {
    projectName,
    vms,
    sriov,
    servers: { count: sc, cpu: scpu, ram: sram },
    cpuRatio: ratio,
    tolerance: tol,
    infra,
    namespaces,
    storageFactor,
    assumptions: { residentCpu: a.residentCpu === undefined ? d.assumptions.residentCpu : rc, residentMem: rm, evictionMem: ev },
    isSample: v.isSample === true,
  };
}

/** 入力が初期状態から変更されているか（詳細版への取り込み案内に使う） */
export function simpleHasContent(s: SimpleInput): boolean {
  return s.vms.some((v) => v.name || v.count || v.vcpu || v.ram.raw || v.disk.raw) || !!s.servers.count || !!s.servers.cpu;
}

// ---- 簡易版のプリセット（このアプリの目安サイズ。公式値ではない） ----

export interface VmPreset {
  key: string;
  label: string;
  vcpu: string;
  ramGiB: string;
  diskGiB: string;
  example: string;
}

export const VM_PRESETS: VmPreset[] = [
  { key: 's', label: 'S', vcpu: '2', ramGiB: '4', diskGiB: '60', example: '踏み台、小さな Web サーバー、DNS など' },
  { key: 'm', label: 'M', vcpu: '4', ramGiB: '16', diskGiB: '120', example: '一般的な業務アプリケーション、AP サーバー' },
  { key: 'l', label: 'L', vcpu: '8', ramGiB: '32', diskGiB: '250', example: '中規模の DB、バッチ処理' },
  { key: 'xl', label: 'XL', vcpu: '16', ramGiB: '64', diskGiB: '500', example: '大きな DB、分析処理' },
];

export const presetVmId = (key: string) => `preset-${key}`;

export interface ServerPreset {
  key: string;
  cpu: string;
  ramGiB: string;
  example: string;
}

export const SERVER_PRESETS: ServerPreset[] = [
  { key: 'c32', cpu: '32', ramGiB: '256', example: '1 ソケット 16 コア（HT 有効）程度' },
  { key: 'c64', cpu: '64', ramGiB: '512', example: '2 ソケット × 16 コア（HT 有効）程度' },
  { key: 'c96', cpu: '96', ramGiB: '768', example: '2 ソケット × 24 コア（HT 有効）程度' },
  { key: 'c128', cpu: '128', ramGiB: '1024', example: '2 ソケット × 32 コア（HT 有効）程度' },
];

/** 規模（Namespace 数）の選択肢。値は公式試験表の Namespace 数の区切り */
export const SCALE_OPTIONS = [
  { value: '500', label: '小規模（Namespace 500 以下）', example: 'VM と少数のアプリだけを載せる、部門単位のクラスタ' },
  { value: '1000', label: '中規模（Namespace 1,000 以下）', example: '複数チームで共有するクラスタ' },
  { value: '4000', label: '大規模（Namespace 4,000 以下）', example: '全社共通基盤として多数のプロジェクトを載せる' },
  { value: '', label: '分からない', example: '利用者や用途がまだ決まっていない' },
] as const;
