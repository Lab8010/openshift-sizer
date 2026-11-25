// 入力の検証と正規化（純粋関数）。
// 既知の 0・未入力・対象外・入力エラーを区別し、単位を基準単位へ変換する。
import {
  BANDWIDTH_UNITS,
  CAPACITY_UNITS,
  MEMORY_UNITS,
  THROUGHPUT_UNITS,
  bandwidthToBitsPerSec,
  capacityToBytes,
  isUnit,
  memoryToMiB,
  throughputToBytesPerSec,
  type BandwidthUnit,
  type CapacityUnit,
  type MemoryUnit,
  type ThroughputUnit,
} from './units';
import type {
  Placement,
  Qty,
  RoleKey,
  ServiceKind,
  SizingInput,
  TriState,
  WorkerBasis,
  PathKey,
} from './types';
import { PATH_LABELS } from './types';

/** 正規化済みの値 */
export type NV =
  | { k: 'v'; v: number }
  | { k: 'empty' }
  | { k: 'na' }
  | { k: 'invalid' };

export const EMPTY: NV = { k: 'empty' };
export const val = (v: number): NV => ({ k: 'v', v });
export const has = (n: NV): n is { k: 'v'; v: number } => n.k === 'v';

export interface FieldError {
  /** フィールドのパス。DOM の id は fieldDomId(path) */
  path: string;
  label: string;
  message: string;
}

export function fieldDomId(path: string): string {
  return 'f-' + path.replace(/[^a-zA-Z0-9_-]/g, '-');
}

interface NumOpts {
  integer?: boolean;
  min?: number;
  minExclusive?: boolean;
  max?: number;
  maxExclusive?: boolean;
  allowNa?: boolean;
}

const NA_WORDS = ['対象外', 'n/a', 'na', '-', '－'];

function normalizeText(raw: string): string {
  return raw
    .replace(/[０-９．，－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/,/g, '')
    .trim();
}

export class Parser {
  errors: FieldError[] = [];

  num(raw: string | undefined, path: string, label: string, opts: NumOpts = {}): NV {
    const text = normalizeText(raw ?? '');
    if (text === '') return EMPTY;
    if (NA_WORDS.includes(text.toLowerCase())) {
      if (opts.allowNa === false) {
        this.errors.push({ path, label, message: `${label}は「対象外」にできません。数値を入力してください。` });
        return { k: 'invalid' };
      }
      return { k: 'na' };
    }
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
      this.errors.push({ path, label, message: `${label}には数値を入力してください（入力値:「${raw}」）。` });
      return { k: 'invalid' };
    }
    const v = Number(text);
    if (!Number.isFinite(v)) {
      this.errors.push({ path, label, message: `${label}の値が大きすぎます。` });
      return { k: 'invalid' };
    }
    if (opts.integer && !Number.isInteger(v)) {
      this.errors.push({ path, label, message: `${label}は整数で入力してください。` });
      return { k: 'invalid' };
    }
    const min = opts.min ?? 0;
    if (v < 0 && min >= 0) {
      this.errors.push({ path, label, message: `${label}に負の値は入力できません。` });
      return { k: 'invalid' };
    }
    if (opts.minExclusive ? v <= min : v < min) {
      this.errors.push({ path, label, message: `${label}は ${min} ${opts.minExclusive ? 'より大きい' : '以上の'}値にしてください。` });
      return { k: 'invalid' };
    }
    if (opts.max !== undefined && (opts.maxExclusive ? v >= opts.max : v > opts.max)) {
      this.errors.push({ path, label, message: `${label}は ${opts.max} ${opts.maxExclusive ? '未満' : '以下'}にしてください。` });
      return { k: 'invalid' };
    }
    return val(v);
  }

  private unit<U extends string>(list: readonly U[], q: Qty<string> | undefined, path: string, label: string): U | null {
    if (!q || !isUnit(list, q.unit)) {
      this.errors.push({ path: path + '.unit', label, message: `${label}の単位が不正です（${list.join('／')} のいずれか）。` });
      return null;
    }
    return q.unit as U;
  }

  /** メモリを MiB に変換 */
  mem(q: Qty<MemoryUnit> | undefined, path: string, label: string, opts: NumOpts = {}): NV {
    const u = this.unit(MEMORY_UNITS, q, path, label);
    const n = this.num(q?.raw, path, label, opts);
    if (u === null) return { k: 'invalid' };
    return has(n) ? val(memoryToMiB(n.v, u)) : n;
  }

  /** 容量を bytes に変換 */
  cap(q: Qty<CapacityUnit> | undefined, path: string, label: string, opts: NumOpts = {}): NV {
    const u = this.unit(CAPACITY_UNITS, q, path, label);
    const n = this.num(q?.raw, path, label, opts);
    if (u === null) return { k: 'invalid' };
    return has(n) ? val(capacityToBytes(n.v, u)) : n;
  }

  /** スループットを bytes/s に変換 */
  tp(q: Qty<ThroughputUnit> | undefined, path: string, label: string, opts: NumOpts = {}): NV {
    const u = this.unit(THROUGHPUT_UNITS, q, path, label);
    const n = this.num(q?.raw, path, label, opts);
    if (u === null) return { k: 'invalid' };
    return has(n) ? val(throughputToBytesPerSec(n.v, u)) : n;
  }

  /** 帯域を bit/s に変換 */
  bw(q: Qty<BandwidthUnit> | undefined, path: string, label: string, opts: NumOpts = {}): NV {
    const u = this.unit(BANDWIDTH_UNITS, q, path, label);
    const n = this.num(q?.raw, path, label, opts);
    if (u === null) return { k: 'invalid' };
    return has(n) ? val(bandwidthToBitsPerSec(n.v, u)) : n;
  }
}

// ---- 正規化済みモデル ----

export interface VmN {
  id: string;
  name: string;
  defined: NV;
  running: NV;
  runningLinked: boolean;
  vcpu: NV;
  ramMiB: NV;
  diskBytes: NV;
  cpuMode: 'shared' | 'dedicated';
  ratio: NV;
  peakCpuMode: 'percent' | 'cores';
  peakCpu: NV;
  graphics: NV;
  sriov: NV;
  gpu: NV;
  sev: boolean;
  tpm: boolean;
  extraCpu: NV;
  backendId: string;
  rwx: TriState;
  readIops: NV;
  writeIops: NV;
  readBps: NV;
  writeBps: NV;
  latencyMs: NV;
  txBps: NV;
  rxBps: NV;
  migratable: boolean;
}

export interface RoleN {
  count: NV;
  cpu: NV;
  ramMiB: NV;
  diskBytes: NV;
  iops: NV;
  nicBps: NV;
  localEstimateBytes: NV;
  allocCpu: NV;
  allocMemMiB: NV;
  sysResCpu: NV;
  sysResMemMiB: NV;
  autoSysReserved: boolean;
  evictionMemMiB: NV;
  residentCpu: NV;
  residentMemMiB: NV;
  residentIncludesVirt: boolean;
  podSlots: NV;
  unavailable: NV;
}

export interface ServiceN {
  id: string;
  kind: ServiceKind;
  name: string;
  placement: Placement;
  replicas: NV;
  cpu: NV;
  memMiB: NV;
  backendId: string;
  perReplicaPerDayBytes: NV;
  retentionDays: NV;
  timeSeries: NV;
  scrapeSec: NV;
  capacityBytes: NV;
  pvFreePct: NV;
  peakBps: NV;
  requestRate: string;
  note: string;
}

export interface PathN {
  key: PathKey;
  nic: string;
  dedicated: boolean;
  clusterTx: NV;
  clusterRx: NV;
  perNodeTx: NV;
  perNodeRx: NV;
}

export interface BackendN {
  id: string;
  name: string;
  factor: NV;
  snapshotGrowthBytes: NV;
  freePct: NV;
  specReadIops: NV;
  specWriteIops: NV;
  specReadBps: NV;
  specWriteBps: NV;
  measuredLatencyMs: NV;
}

export interface SizingModel {
  projectName: string;
  platform: string;
  platformNote: string;
  namespaces: NV;
  operatorNotes: string;
  plan1to1: boolean;
  cpWorkerBasis: WorkerBasis;
  cpWorkerManual: NV;
  infraWorkerBasis: WorkerBasis;
  infraWorkerManual: NV;
  infraEnabled: boolean;
  infraEvenDistribution: boolean;
  vms: VmN[];
  roles: Record<RoleKey, RoleN>;
  cpMetrics: { cpuUtil: NV; memUtil: NV; fsyncMs: NV; rttMs: NV };
  services: ServiceN[];
  availability: {
    computeDrain: NV;
    parallelMigrations: NV;
    parallelPerNode: NV;
    migrationTargetSec: NV;
    dirtyRateBps: NV;
    measuredTransferBytes: NV;
    placementConstraints: boolean;
    placementNote: string;
    cpuModelCompatible: TriState;
  };
  paths: PathN[];
  backends: BackendN[];
  isSample: boolean;
}

const ROLE_LABEL: Record<RoleKey, string> = {
  controlPlane: 'コントロールプレーン',
  compute: 'コンピュート',
  infra: 'インフラ',
};

function parseRole(p: Parser, key: RoleKey, r: SizingInput['roles'][RoleKey]): RoleN {
  const L = ROLE_LABEL[key];
  const base = `roles.${key}`;
  return {
    count: p.num(r.count, `${base}.count`, `${L}の台数`, { integer: true, allowNa: false }),
    cpu: p.num(r.cpu, `${base}.cpu`, `${L}の候補 CPU（1 台あたり）`, { allowNa: false }),
    ramMiB: p.mem(r.ram, `${base}.ram`, `${L}の候補メモリ（1 台あたり）`, { allowNa: false }),
    diskBytes: p.cap(r.disk, `${base}.disk`, `${L}の候補ローカルディスク（1 台あたり）`, { allowNa: false }),
    iops: p.num(r.iops, `${base}.iops`, `${L}の候補ディスク IOPS（1 台あたり）`),
    nicBps: p.bw(r.nic, `${base}.nic`, `${L}の NIC 帯域（1 ポートあたり）`),
    localEstimateBytes: p.cap(r.localEstimate, `${base}.localEstimate`, `${L}のローカルディスク消費見積もり`),
    allocCpu: p.num(r.allocCpu, `${base}.allocCpu`, `${L}の Allocatable CPU`, { allowNa: false }),
    allocMemMiB: p.mem(r.allocMem, `${base}.allocMem`, `${L}の Allocatable メモリ`, { allowNa: false }),
    sysResCpu: p.num(r.sysResCpu, `${base}.sysResCpu`, `${L}のシステム予約 CPU`, { allowNa: false }),
    sysResMemMiB: p.mem(r.sysResMem, `${base}.sysResMem`, `${L}のシステム予約メモリ`, { allowNa: false }),
    autoSysReserved: !!r.autoSysReserved,
    evictionMemMiB: p.mem(r.evictionMem, `${base}.evictionMem`, `${L}のハード Eviction しきい値（メモリ）`, { allowNa: false }),
    residentCpu: p.num(r.residentCpu, `${base}.residentCpu`, `${L}の常駐 Pod の CPU 要求量`, { allowNa: false }),
    residentMemMiB: p.mem(r.residentMem, `${base}.residentMem`, `${L}の常駐 Pod のメモリ要求量`, { allowNa: false }),
    residentIncludesVirt: !!r.residentIncludesVirt,
    podSlots: p.num(r.podSlots, `${base}.podSlots`, `${L}の残りの Pod 枠`, { integer: true }),
    unavailable: p.num(r.unavailable, `${base}.unavailable`, `${L}の利用できないノード数`, { integer: true, allowNa: false }),
  };
}

function tri(v: unknown): TriState {
  return v === 'yes' || v === 'no' ? v : 'unknown';
}

function basis(v: unknown): WorkerBasis {
  return v === 'computePlusInfra' || v === 'manual' ? v : 'compute';
}

/** 入力全体を検証・正規化する */
export function parseInput(input: SizingInput): { model: SizingModel; errors: FieldError[] } {
  const p = new Parser();
  const c = input.cluster;

  const vms: VmN[] = input.vms.map((vm, i) => {
    const base = `vms.${vm.id}`;
    const L = `VM「${vm.name || `${i + 1} 行目`}」の`;
    const defined = p.num(vm.definedCount, `${base}.definedCount`, `${L}定義台数`, { integer: true, allowNa: false });
    const running = vm.runningLinked
      ? defined
      : p.num(vm.runningCount, `${base}.runningCount`, `${L}最大同時稼働台数`, { integer: true, allowNa: false });
    if (!vm.runningLinked && has(defined) && has(running) && running.v > defined.v) {
      p.errors.push({
        path: `${base}.runningCount`,
        label: `${L}最大同時稼働台数`,
        message: `${L}最大同時稼働台数（${running.v}）が定義台数（${defined.v}）を超えています。`,
      });
    }
    const runningOk = !vm.runningLinked && has(defined) && has(running) && running.v > defined.v ? ({ k: 'invalid' } as NV) : running;
    return {
      id: vm.id,
      name: vm.name || `プロファイル ${i + 1}`,
      defined,
      running: runningOk,
      runningLinked: !!vm.runningLinked,
      vcpu: p.num(vm.vcpu, `${base}.vcpu`, `${L}vCPU`, { integer: true, min: 1, allowNa: false }),
      ramMiB: p.mem(vm.ram, `${base}.ram`, `${L}ゲスト RAM`, { minExclusive: true, allowNa: false }),
      diskBytes: p.cap(vm.disk, `${base}.disk`, `${L}ディスクの合計論理容量`),
      cpuMode: vm.cpuMode === 'dedicated' ? 'dedicated' : 'shared',
      ratio: p.num(vm.allocationRatio, `${base}.allocationRatio`, `${L}CPU 割り当て比率`, { minExclusive: true }),
      peakCpuMode: vm.peakCpuMode === 'cores' ? 'cores' : 'percent',
      peakCpu: p.num(vm.peakCpu, `${base}.peakCpu`, vm.peakCpuMode === 'cores' ? `${L}実測 CPU（コア）` : `${L}ピーク CPU 使用率（%）`, vm.peakCpuMode === 'cores' ? {} : { max: 100 }),
      graphics: p.num(vm.graphics, `${base}.graphics`, `${L}グラフィックスデバイス数`, { integer: true }),
      sriov: p.num(vm.sriov, `${base}.sriov`, `${L}SR-IOV デバイス数`, { integer: true }),
      gpu: p.num(vm.gpu, `${base}.gpu`, `${L}GPU 数`, { integer: true }),
      sev: !!vm.sev,
      tpm: !!vm.tpm,
      extraCpu: p.num(vm.extraCpu, `${base}.extraCpu`, `${L}追加 CPU 要求量`),
      backendId: vm.backendId ?? '',
      rwx: tri(vm.rwx),
      readIops: p.num(vm.readIops, `${base}.readIops`, `${L}ピーク読み込み IOPS`),
      writeIops: p.num(vm.writeIops, `${base}.writeIops`, `${L}ピーク書き込み IOPS`),
      readBps: p.tp(vm.readTp, `${base}.readTp`, `${L}ピーク読み込みスループット`),
      writeBps: p.tp(vm.writeTp, `${base}.writeTp`, `${L}ピーク書き込みスループット`),
      latencyMs: p.num(vm.latencyMs, `${base}.latencyMs`, `${L}許容レイテンシ`, { minExclusive: true }),
      txBps: p.bw(vm.txBw, `${base}.txBw`, `${L}ピーク送信帯域`),
      rxBps: p.bw(vm.rxBw, `${base}.rxBw`, `${L}ピーク受信帯域`),
      migratable: !!vm.migratable,
    };
  });

  const roles = {
    controlPlane: parseRole(p, 'controlPlane', input.roles.controlPlane),
    compute: parseRole(p, 'compute', input.roles.compute),
    infra: parseRole(p, 'infra', input.roles.infra),
  };

  const m = input.cpMetrics;
  const cpMetrics = {
    cpuUtil: p.num(m.cpuUtil, 'cpMetrics.cpuUtil', 'コントロールプレーンの平常時 CPU 使用率', { max: 100 }),
    memUtil: p.num(m.memUtil, 'cpMetrics.memUtil', 'コントロールプレーンの平常時メモリ使用率', { max: 100 }),
    fsyncMs: p.num(m.fsyncMs, 'cpMetrics.fsyncMs', 'etcd ディスクの p99 fsync'),
    rttMs: p.num(m.rttMs, 'cpMetrics.rttMs', 'etcd メンバー間の p99 RTT'),
  };

  const services: ServiceN[] = input.services.map((s) => {
    const base = `services.${s.id}`;
    const L = `${s.name || 'サービス'}の`;
    return {
      id: s.id,
      kind: s.kind,
      name: s.name || 'サービス',
      placement: s.placement,
      replicas: p.num(s.replicas, `${base}.replicas`, `${L}レプリカ数`, { integer: true }),
      cpu: p.num(s.cpu, `${base}.cpu`, `${L}CPU 要求量（1 レプリカ）`),
      memMiB: p.mem(s.mem, `${base}.mem`, `${L}メモリ要求量（1 レプリカ）`),
      backendId: s.backendId ?? '',
      perReplicaPerDayBytes: p.cap(s.perReplicaPerDay, `${base}.perReplicaPerDay`, `${L}1 レプリカ・1 日あたりの実効保存量`),
      retentionDays: p.num(s.retentionDays, `${base}.retentionDays`, `${L}保持日数`, { minExclusive: true }),
      timeSeries: p.num(s.timeSeries, `${base}.timeSeries`, `${L}時系列数`, { integer: true }),
      scrapeSec: p.num(s.scrapeSec, `${base}.scrapeSec`, `${L}収集間隔`, { minExclusive: true }),
      capacityBytes: p.cap(s.capacity, `${base}.capacity`, `${L}実効保存量`),
      pvFreePct: p.num(s.pvFreePct, `${base}.pvFreePct`, `${L}PV の空き容量比率`, { max: 100, maxExclusive: true }),
      peakBps: p.bw(s.peakBw, `${base}.peakBw`, `${L}ピーク帯域`),
      requestRate: s.requestRate ?? '',
      note: s.note ?? '',
    };
  });

  const a = input.availability;
  const availability = {
    computeDrain: p.num(a.computeDrain, 'availability.computeDrain', 'コンピュートの同時 drain ノード数', { integer: true }),
    parallelMigrations: p.num(a.parallelMigrations, 'availability.parallelMigrations', '同時移行数（クラスタ全体）', { integer: true, min: 1 }),
    parallelPerNode: p.num(a.parallelPerNode, 'availability.parallelPerNode', '送信元ノードごとの同時移行数', { integer: true, min: 1 }),
    migrationTargetSec: p.num(a.migrationTargetSec, 'availability.migrationTargetSec', '移行の目標時間', { minExclusive: true }),
    dirtyRateBps: p.tp(a.dirtyRate, 'availability.dirtyRate', '移行中のメモリ更新速度'),
    measuredTransferBytes: p.cap(a.measuredTransfer, 'availability.measuredTransfer', '実測の総転送量'),
    placementConstraints: !!a.placementConstraints,
    placementNote: a.placementNote ?? '',
    cpuModelCompatible: tri(a.cpuModelCompatible),
  };

  const paths: PathN[] = input.paths.map((x) => {
    const base = `paths.${x.key}`;
    const L = `${PATH_LABELS[x.key]}経路の`;
    return {
      key: x.key,
      nic: (x.nic ?? '').trim(),
      dedicated: !!x.dedicated,
      clusterTx: p.bw(x.clusterTx, `${base}.clusterTx`, `${L}ピーク送信（クラスタ合計）`),
      clusterRx: p.bw(x.clusterRx, `${base}.clusterRx`, `${L}ピーク受信（クラスタ合計）`),
      perNodeTx: p.bw(x.perNodeTx, `${base}.perNodeTx`, `${L}ピーク送信（ノードあたり）`),
      perNodeRx: p.bw(x.perNodeRx, `${base}.perNodeRx`, `${L}ピーク受信（ノードあたり）`),
    };
  });

  const backends: BackendN[] = input.backends.map((b, i) => {
    const base = `backends.${b.id}`;
    const L = `ストレージ「${b.name || `${i + 1} 行目`}」の`;
    return {
      id: b.id,
      name: b.name || `バックエンド ${i + 1}`,
      factor: p.num(b.factor, `${base}.factor`, `${L}物理容量係数`, { minExclusive: true }),
      snapshotGrowthBytes: p.cap(b.snapshotGrowth, `${base}.snapshotGrowth`, `${L}スナップショット・増加見込み`),
      freePct: p.num(b.freePct, `${base}.freePct`, `${L}空き容量比率`, { max: 100, maxExclusive: true }),
      specReadIops: p.num(b.specReadIops, `${base}.specReadIops`, `${L}読み込み IOPS 仕様`),
      specWriteIops: p.num(b.specWriteIops, `${base}.specWriteIops`, `${L}書き込み IOPS 仕様`),
      specReadBps: p.tp(b.specReadTp, `${base}.specReadTp`, `${L}読み込みスループット仕様`),
      specWriteBps: p.tp(b.specWriteTp, `${base}.specWriteTp`, `${L}書き込みスループット仕様`),
      measuredLatencyMs: p.num(b.measuredLatencyMs, `${base}.measuredLatencyMs`, `${L}実測レイテンシ`),
    };
  });

  const model: SizingModel = {
    projectName: c.projectName ?? '',
    platform: c.platform ?? '',
    platformNote: c.platformNote ?? '',
    namespaces: p.num(c.namespaces, 'cluster.namespaces', 'Namespace 数', { integer: true, allowNa: false }),
    operatorNotes: c.operatorNotes ?? '',
    plan1to1: !!c.plan1to1,
    cpWorkerBasis: basis(c.cpWorkerBasis),
    cpWorkerManual: p.num(c.cpWorkerManual, 'cluster.cpWorkerManual', 'コントロールプレーンの比較に使う Worker 台数', { integer: true, allowNa: false }),
    infraWorkerBasis: basis(c.infraWorkerBasis),
    infraWorkerManual: p.num(c.infraWorkerManual, 'cluster.infraWorkerManual', 'インフラの比較に使う Worker 台数', { integer: true, allowNa: false }),
    infraEnabled: !!c.infraEnabled,
    infraEvenDistribution: !!c.infraEvenDistribution,
    vms,
    roles,
    cpMetrics,
    services,
    availability,
    paths,
    backends,
    isSample: !!input.isSample,
  };
  return { model, errors: p.errors };
}
