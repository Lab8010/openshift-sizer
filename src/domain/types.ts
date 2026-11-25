// 画面で編集する生の入力モデル。数値は文字列のまま保持し、検証と正規化は parse.ts で行う。
// 空文字 = 未入力、「対象外」= 対象外、数値 = 既知の値（0 を含む）。
import type { BandwidthUnit, CapacityUnit, MemoryUnit, ThroughputUnit } from './units';

export const SCHEMA_VERSION = 1;

export interface Qty<U extends string> {
  raw: string;
  unit: U;
}

export type TriState = 'yes' | 'no' | 'unknown';

export interface VmProfileInput {
  id: string;
  name: string;
  definedCount: string;
  runningCount: string;
  /** true の間は最大同時稼働台数 = 定義台数（初期値） */
  runningLinked: boolean;
  vcpu: string;
  ram: Qty<MemoryUnit>;
  disk: Qty<CapacityUnit>;
  cpuMode: 'shared' | 'dedicated';
  allocationRatio: string;
  peakCpuMode: 'percent' | 'cores';
  peakCpu: string;
  graphics: string;
  sriov: string;
  gpu: string;
  sev: boolean;
  tpm: boolean;
  extraCpu: string;
  backendId: string;
  rwx: TriState;
  readIops: string;
  writeIops: string;
  readTp: Qty<ThroughputUnit>;
  writeTp: Qty<ThroughputUnit>;
  latencyMs: string;
  txBw: Qty<BandwidthUnit>;
  rxBw: Qty<BandwidthUnit>;
  migratable: boolean;
}

export type RoleKey = 'controlPlane' | 'compute' | 'infra';

export interface RoleInput {
  count: string;
  cpu: string;
  ram: Qty<MemoryUnit>;
  disk: Qty<CapacityUnit>;
  iops: string;
  nic: Qty<BandwidthUnit>;
  /** OS・イメージ・ログ・etcd・一時領域などローカルディスク消費の見積もり */
  localEstimate: Qty<CapacityUnit>;
  allocCpu: string;
  allocMem: Qty<MemoryUnit>;
  sysResCpu: string;
  sysResMem: Qty<MemoryUnit>;
  autoSysReserved: boolean;
  evictionMem: Qty<MemoryUnit>;
  residentCpu: string;
  residentMem: Qty<MemoryUnit>;
  /** 常駐 Pod の実測要求に Virtualization のノード分が含まれている */
  residentIncludesVirt: boolean;
  podSlots: string;
  /** 障害・メンテナンスで利用できないノード数 */
  unavailable: string;
}

export type WorkerBasis = 'compute' | 'computePlusInfra' | 'manual';

export const PLATFORMS = [
  'オンプレミスのベアメタル',
  'ARM64 ベアメタル',
  'IBM Z／LinuxONE（LPAR）',
  'AWS ベアメタル',
  'IBM Cloud ベアメタル',
  'その他のクラウドのベアメタル',
  'その他',
  '未定',
] as const;

export interface ClusterInput {
  projectName: string;
  platform: string;
  platformNote: string;
  namespaces: string;
  operatorNotes: string;
  /** 比率未入力の共有 CPU VM を 1:1 で計画する（明示選択） */
  plan1to1: boolean;
  cpWorkerBasis: WorkerBasis;
  cpWorkerManual: string;
  infraWorkerBasis: WorkerBasis;
  infraWorkerManual: string;
  infraEnabled: boolean;
  /** インフラのサービス要求量をノードへ均等配分する計画 */
  infraEvenDistribution: boolean;
}

export interface ControlPlaneMetrics {
  cpuUtil: string;
  memUtil: string;
  fsyncMs: string;
  rttMs: string;
}

export type ServiceKind = 'monitoring' | 'ingress' | 'registry' | 'logging' | 'other';
export type Placement = 'infra' | 'compute' | 'controlPlane' | 'external' | 'none';

export interface ServiceInput {
  id: string;
  kind: ServiceKind;
  name: string;
  placement: Placement;
  replicas: string;
  cpu: string;
  mem: Qty<MemoryUnit>;
  backendId: string;
  /** 監視：1 レプリカ・1 日あたりの実効保存量 */
  perReplicaPerDay: Qty<CapacityUnit>;
  retentionDays: string;
  timeSeries: string;
  scrapeSec: string;
  /** レジストリ・ログ・その他：実効保存量（合計） */
  capacity: Qty<CapacityUnit>;
  /** PV に確保する空き容量比率（%） */
  pvFreePct: string;
  /** Ingress：ピーク帯域 */
  peakBw: Qty<BandwidthUnit>;
  requestRate: string;
  note: string;
}

export interface AvailabilityInput {
  computeDrain: string;
  parallelMigrations: string;
  parallelPerNode: string;
  migrationTargetSec: string;
  dirtyRate: Qty<ThroughputUnit>;
  measuredTransfer: Qty<CapacityUnit>;
  placementConstraints: boolean;
  placementNote: string;
  cpuModelCompatible: TriState;
}

export type PathKey = 'management' | 'guest' | 'ingress' | 'storage' | 'backup' | 'migration';
export const PATH_KEYS: PathKey[] = ['management', 'guest', 'ingress', 'storage', 'backup', 'migration'];
export const PATH_LABELS: Record<PathKey, string> = {
  management: '管理',
  guest: 'ゲスト',
  ingress: 'Ingress',
  storage: 'ストレージ',
  backup: 'バックアップ',
  migration: 'ライブマイグレーション',
};

export interface NetworkPathInput {
  key: PathKey;
  nic: string;
  dedicated: boolean;
  clusterTx: Qty<BandwidthUnit>;
  clusterRx: Qty<BandwidthUnit>;
  perNodeTx: Qty<BandwidthUnit>;
  perNodeRx: Qty<BandwidthUnit>;
}

export interface StorageBackendInput {
  id: string;
  name: string;
  factor: string;
  snapshotGrowth: Qty<CapacityUnit>;
  freePct: string;
  specReadIops: string;
  specWriteIops: string;
  specReadTp: Qty<ThroughputUnit>;
  specWriteTp: Qty<ThroughputUnit>;
  measuredLatencyMs: string;
}

export interface SizingInput {
  cluster: ClusterInput;
  vms: VmProfileInput[];
  roles: Record<RoleKey, RoleInput>;
  cpMetrics: ControlPlaneMetrics;
  services: ServiceInput[];
  availability: AvailabilityInput;
  paths: NetworkPathInput[];
  backends: StorageBackendInput[];
  /** サンプル値を読み込んだ場合 true（画面と帳票に表示する） */
  isSample: boolean;
  /** 簡易版などで追加する前提（結果の「このアプリの仮定」に表示） */
  extraAssumptions?: string[];
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function emptyVm(id = newId('vm')): VmProfileInput {
  return {
    id,
    name: '',
    definedCount: '',
    runningCount: '',
    runningLinked: true,
    vcpu: '',
    ram: { raw: '', unit: 'GiB' },
    disk: { raw: '', unit: 'GiB' },
    cpuMode: 'shared',
    allocationRatio: '',
    peakCpuMode: 'percent',
    peakCpu: '',
    // デバイス数の初期値（このアプリの初期値。画面に表示し、変更できる）
    graphics: '1',
    sriov: '0',
    gpu: '0',
    sev: false,
    tpm: false,
    extraCpu: '',
    backendId: '',
    rwx: 'unknown',
    readIops: '',
    writeIops: '',
    readTp: { raw: '', unit: 'MiB/s' },
    writeTp: { raw: '', unit: 'MiB/s' },
    latencyMs: '',
    txBw: { raw: '', unit: 'Mbps' },
    rxBw: { raw: '', unit: 'Mbps' },
    migratable: true,
  };
}

export function emptyRole(count = ''): RoleInput {
  return {
    count,
    cpu: '',
    ram: { raw: '', unit: 'GiB' },
    disk: { raw: '', unit: 'GB' },
    iops: '',
    nic: { raw: '', unit: 'Gbps' },
    localEstimate: { raw: '', unit: 'GiB' },
    allocCpu: '',
    allocMem: { raw: '', unit: 'GiB' },
    sysResCpu: '',
    sysResMem: { raw: '', unit: 'GiB' },
    autoSysReserved: true,
    evictionMem: { raw: '', unit: 'MiB' },
    residentCpu: '',
    residentMem: { raw: '', unit: 'GiB' },
    residentIncludesVirt: false,
    podSlots: '',
    unavailable: '',
  };
}

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  monitoring: '監視（Prometheus 等）',
  ingress: 'Ingress（ルーター）',
  registry: 'イメージレジストリ',
  logging: 'ログ',
  other: 'その他',
};

export const PLACEMENT_LABELS: Record<Placement, string> = {
  infra: 'インフラノード',
  compute: 'コンピュートノード',
  controlPlane: 'コントロールプレーン',
  external: 'クラスタ外',
  none: '導入しない',
};

export function emptyService(kind: ServiceKind, id = newId('svc')): ServiceInput {
  return {
    id,
    kind,
    name: SERVICE_LABELS[kind],
    placement: 'infra',
    replicas: '',
    cpu: '',
    mem: { raw: '', unit: 'GiB' },
    backendId: '',
    perReplicaPerDay: { raw: '', unit: 'GiB' },
    retentionDays: '',
    timeSeries: '',
    scrapeSec: '',
    capacity: { raw: '', unit: 'GiB' },
    pvFreePct: '',
    peakBw: { raw: '', unit: 'Mbps' },
    requestRate: '',
    note: '',
  };
}

export function emptyBackend(id = newId('sb')): StorageBackendInput {
  return {
    id,
    name: '',
    factor: '',
    snapshotGrowth: { raw: '', unit: 'GiB' },
    freePct: '',
    specReadIops: '',
    specWriteIops: '',
    specReadTp: { raw: '', unit: 'MiB/s' },
    specWriteTp: { raw: '', unit: 'MiB/s' },
    measuredLatencyMs: '',
  };
}

export function emptyPath(key: PathKey): NetworkPathInput {
  return {
    key,
    nic: '',
    dedicated: false,
    clusterTx: { raw: '', unit: 'Mbps' },
    clusterRx: { raw: '', unit: 'Mbps' },
    perNodeTx: { raw: '', unit: 'Mbps' },
    perNodeRx: { raw: '', unit: 'Mbps' },
  };
}

export function emptyInput(): SizingInput {
  return {
    cluster: {
      projectName: '',
      platform: '未定',
      platformNote: '',
      namespaces: '',
      operatorNotes: '',
      plan1to1: false,
      cpWorkerBasis: 'compute',
      cpWorkerManual: '',
      infraWorkerBasis: 'computePlusInfra',
      infraWorkerManual: '',
      infraEnabled: true,
      infraEvenDistribution: false,
    },
    vms: [emptyVm()],
    roles: {
      controlPlane: emptyRole('3'),
      compute: emptyRole(''),
      infra: emptyRole('3'),
    },
    cpMetrics: { cpuUtil: '', memUtil: '', fsyncMs: '', rttMs: '' },
    services: (['monitoring', 'ingress', 'registry', 'logging'] as ServiceKind[]).map((k) => emptyService(k)),
    availability: {
      computeDrain: '',
      parallelMigrations: '',
      parallelPerNode: '',
      migrationTargetSec: '',
      dirtyRate: { raw: '', unit: 'MiB/s' },
      measuredTransfer: { raw: '', unit: 'GiB' },
      placementConstraints: false,
      placementNote: '',
      cpuModelCompatible: 'unknown',
    },
    paths: PATH_KEYS.map(emptyPath),
    backends: [],
    isSample: false,
  };
}
