// JSON のエクスポートと再読み込み。読み込み時は形式を検証し、現在のロジックで再計算する。
import { calculateSizing } from './calc';
import type { SizingResult } from './result';
import { PRODUCT, SOURCES } from './sources';
import {
  PATH_KEYS,
  SCHEMA_VERSION,
  emptyBackend,
  emptyInput,
  emptyPath,
  emptyRole,
  emptyService,
  emptyVm,
  type SizingInput,
} from './types';
import { BANDWIDTH_UNITS, CAPACITY_UNITS, MEMORY_UNITS, THROUGHPUT_UNITS } from './units';
import { parseSimple, type SimpleInput } from './simple';

export type InputMode = 'simple' | 'detail';

export interface ExportFile {
  schemaVersion: number;
  product: { ocp: string; virt: string; version: string };
  exportedAt: string;
  /** 保存時の入力モード。簡易版では input は simple から組み立てた入力 */
  mode: InputMode;
  simple?: SimpleInput;
  input: SizingInput;
  result: SizingResult;
  references: { id: string; title: string; sections: string; url: string }[];
}

export function buildExport(input: SizingInput, result: SizingResult, now = new Date(), simple?: SimpleInput): ExportFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    product: { ocp: PRODUCT.ocp, virt: PRODUCT.virt, version: PRODUCT.version },
    exportedAt: now.toISOString(),
    mode: simple ? 'simple' : 'detail',
    ...(simple ? { simple } : {}),
    input,
    result,
    references: Object.values(SOURCES).map((s) => ({ id: s.id, title: s.title, sections: s.sections, url: s.url })),
  };
}

export type ImportResult = { ok: true; input: SizingInput; warnings: string[]; mode: InputMode; simple?: SimpleInput } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 型が合わない項目は形式エラーとして集める */
class Shape {
  errors: string[] = [];
  str(o: Obj, key: string, path: string, fallback = ''): string {
    const v = o[key];
    if (v === undefined) return fallback;
    if (typeof v === 'number') return String(v);
    if (typeof v !== 'string') {
      this.errors.push(`${path}.${key} は文字列である必要があります`);
      return fallback;
    }
    return v;
  }
  bool(o: Obj, key: string, path: string, fallback: boolean): boolean {
    const v = o[key];
    if (v === undefined) return fallback;
    if (typeof v !== 'boolean') {
      this.errors.push(`${path}.${key} は true／false である必要があります`);
      return fallback;
    }
    return v;
  }
  oneOf<T extends string>(o: Obj, key: string, path: string, list: readonly T[], fallback: T): T {
    const v = o[key];
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) {
      this.errors.push(`${path}.${key} の値「${String(v)}」は不正です（${list.join('／')}）`);
      return fallback;
    }
    return v as T;
  }
  qty<U extends string>(o: Obj, key: string, path: string, units: readonly U[], fallback: { raw: string; unit: U }): { raw: string; unit: U } {
    const v = o[key];
    if (v === undefined) return fallback;
    if (!isObj(v)) {
      this.errors.push(`${path}.${key} は { raw, unit } の形式である必要があります`);
      return fallback;
    }
    return { raw: this.str(v, 'raw', `${path}.${key}`), unit: this.oneOf(v, 'unit', `${path}.${key}`, units, fallback.unit) };
  }
  arr(o: Obj, key: string, path: string): Obj[] {
    const v = o[key];
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every(isObj)) {
      this.errors.push(`${path}.${key} はオブジェクトの配列である必要があります`);
      return [];
    }
    return v as Obj[];
  }
  obj(o: Obj, key: string, path: string): Obj {
    const v = o[key];
    if (v === undefined) return {};
    if (!isObj(v)) {
      this.errors.push(`${path}.${key} はオブジェクトである必要があります`);
      return {};
    }
    return v;
  }
}

const TRI = ['yes', 'no', 'unknown'] as const;
const BASIS = ['compute', 'computePlusInfra', 'manual'] as const;
const PLACEMENTS = ['infra', 'compute', 'controlPlane', 'external', 'none'] as const;
const KINDS = ['monitoring', 'ingress', 'registry', 'logging', 'other'] as const;

/** JSON テキストを読み込み、入力モデルに変換する。入力値の妥当性は calculateSizing の検証で確認する */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON として読み込めません。ファイルの形式を確認してください。'] };
  }
  if (!isObj(data)) return { ok: false, errors: ['JSON の最上位がオブジェクトではありません。'] };
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, errors: [`schemaVersion が対応していません（ファイル: ${String(data.schemaVersion)}、対応: ${SCHEMA_VERSION}）。`] };
  }
  const product = isObj(data.product) ? data.product : {};
  if (product.version !== PRODUCT.version) {
    return { ok: false, errors: [`製品バージョンが一致しません（ファイル: ${String(product.version)}、このアプリ: ${PRODUCT.version}）。`] };
  }
  if (!isObj(data.input)) return { ok: false, errors: ['input がありません。'] };
  const s = new Shape();
  const i = data.input;
  const base = emptyInput();

  const c = s.obj(i, 'cluster', 'input');
  const cluster = {
    projectName: s.str(c, 'projectName', 'cluster'),
    platform: s.str(c, 'platform', 'cluster', base.cluster.platform),
    platformNote: s.str(c, 'platformNote', 'cluster'),
    namespaces: s.str(c, 'namespaces', 'cluster'),
    operatorNotes: s.str(c, 'operatorNotes', 'cluster'),
    plan1to1: s.bool(c, 'plan1to1', 'cluster', false),
    cpWorkerBasis: s.oneOf(c, 'cpWorkerBasis', 'cluster', BASIS, 'compute'),
    cpWorkerManual: s.str(c, 'cpWorkerManual', 'cluster'),
    infraWorkerBasis: s.oneOf(c, 'infraWorkerBasis', 'cluster', BASIS, 'computePlusInfra'),
    infraWorkerManual: s.str(c, 'infraWorkerManual', 'cluster'),
    infraEnabled: s.bool(c, 'infraEnabled', 'cluster', true),
    infraEvenDistribution: s.bool(c, 'infraEvenDistribution', 'cluster', false),
  };

  const vms = s.arr(i, 'vms', 'input').map((v, idx) => {
    const p = `vms[${idx}]`;
    const d = emptyVm(s.str(v, 'id', p) || `vm-import-${idx}`);
    return {
      ...d,
      name: s.str(v, 'name', p),
      definedCount: s.str(v, 'definedCount', p),
      runningCount: s.str(v, 'runningCount', p),
      runningLinked: s.bool(v, 'runningLinked', p, true),
      vcpu: s.str(v, 'vcpu', p),
      ram: s.qty(v, 'ram', p, MEMORY_UNITS, d.ram),
      disk: s.qty(v, 'disk', p, CAPACITY_UNITS, d.disk),
      cpuMode: s.oneOf(v, 'cpuMode', p, ['shared', 'dedicated'] as const, 'shared'),
      allocationRatio: s.str(v, 'allocationRatio', p),
      peakCpuMode: s.oneOf(v, 'peakCpuMode', p, ['percent', 'cores'] as const, 'percent'),
      peakCpu: s.str(v, 'peakCpu', p),
      graphics: s.str(v, 'graphics', p, d.graphics),
      sriov: s.str(v, 'sriov', p, d.sriov),
      gpu: s.str(v, 'gpu', p, d.gpu),
      sev: s.bool(v, 'sev', p, false),
      tpm: s.bool(v, 'tpm', p, false),
      extraCpu: s.str(v, 'extraCpu', p),
      backendId: s.str(v, 'backendId', p),
      rwx: s.oneOf(v, 'rwx', p, TRI, 'unknown'),
      readIops: s.str(v, 'readIops', p),
      writeIops: s.str(v, 'writeIops', p),
      readTp: s.qty(v, 'readTp', p, THROUGHPUT_UNITS, d.readTp),
      writeTp: s.qty(v, 'writeTp', p, THROUGHPUT_UNITS, d.writeTp),
      latencyMs: s.str(v, 'latencyMs', p),
      txBw: s.qty(v, 'txBw', p, BANDWIDTH_UNITS, d.txBw),
      rxBw: s.qty(v, 'rxBw', p, BANDWIDTH_UNITS, d.rxBw),
      migratable: s.bool(v, 'migratable', p, true),
    };
  });
  if (!vms.length) s.errors.push('VM プロファイル（input.vms）が 1 件もありません');

  const rolesObj = s.obj(i, 'roles', 'input');
  const role = (key: 'controlPlane' | 'compute' | 'infra') => {
    const r = s.obj(rolesObj, key, 'roles');
    const p = `roles.${key}`;
    const d = emptyRole();
    return {
      count: s.str(r, 'count', p),
      cpu: s.str(r, 'cpu', p),
      ram: s.qty(r, 'ram', p, MEMORY_UNITS, d.ram),
      disk: s.qty(r, 'disk', p, CAPACITY_UNITS, d.disk),
      iops: s.str(r, 'iops', p),
      nic: s.qty(r, 'nic', p, BANDWIDTH_UNITS, d.nic),
      localEstimate: s.qty(r, 'localEstimate', p, CAPACITY_UNITS, d.localEstimate),
      allocCpu: s.str(r, 'allocCpu', p),
      allocMem: s.qty(r, 'allocMem', p, MEMORY_UNITS, d.allocMem),
      sysResCpu: s.str(r, 'sysResCpu', p),
      sysResMem: s.qty(r, 'sysResMem', p, MEMORY_UNITS, d.sysResMem),
      autoSysReserved: s.bool(r, 'autoSysReserved', p, true),
      evictionMem: s.qty(r, 'evictionMem', p, MEMORY_UNITS, d.evictionMem),
      residentCpu: s.str(r, 'residentCpu', p),
      residentMem: s.qty(r, 'residentMem', p, MEMORY_UNITS, d.residentMem),
      residentIncludesVirt: s.bool(r, 'residentIncludesVirt', p, false),
      podSlots: s.str(r, 'podSlots', p),
      unavailable: s.str(r, 'unavailable', p),
    };
  };

  const m = s.obj(i, 'cpMetrics', 'input');
  const services = s.arr(i, 'services', 'input').map((v, idx) => {
    const p = `services[${idx}]`;
    const kind = s.oneOf(v, 'kind', p, KINDS, 'other');
    const d = emptyService(kind, s.str(v, 'id', p) || `svc-import-${idx}`);
    return {
      ...d,
      name: s.str(v, 'name', p, d.name),
      placement: s.oneOf(v, 'placement', p, PLACEMENTS, 'infra'),
      replicas: s.str(v, 'replicas', p),
      cpu: s.str(v, 'cpu', p),
      mem: s.qty(v, 'mem', p, MEMORY_UNITS, d.mem),
      backendId: s.str(v, 'backendId', p),
      perReplicaPerDay: s.qty(v, 'perReplicaPerDay', p, CAPACITY_UNITS, d.perReplicaPerDay),
      retentionDays: s.str(v, 'retentionDays', p),
      timeSeries: s.str(v, 'timeSeries', p),
      scrapeSec: s.str(v, 'scrapeSec', p),
      capacity: s.qty(v, 'capacity', p, CAPACITY_UNITS, d.capacity),
      pvFreePct: s.str(v, 'pvFreePct', p),
      peakBw: s.qty(v, 'peakBw', p, BANDWIDTH_UNITS, d.peakBw),
      requestRate: s.str(v, 'requestRate', p),
      note: s.str(v, 'note', p),
    };
  });

  const a = s.obj(i, 'availability', 'input');
  const availability = {
    computeDrain: s.str(a, 'computeDrain', 'availability'),
    parallelMigrations: s.str(a, 'parallelMigrations', 'availability'),
    parallelPerNode: s.str(a, 'parallelPerNode', 'availability'),
    migrationTargetSec: s.str(a, 'migrationTargetSec', 'availability'),
    dirtyRate: s.qty(a, 'dirtyRate', 'availability', THROUGHPUT_UNITS, base.availability.dirtyRate),
    measuredTransfer: s.qty(a, 'measuredTransfer', 'availability', CAPACITY_UNITS, base.availability.measuredTransfer),
    placementConstraints: s.bool(a, 'placementConstraints', 'availability', false),
    placementNote: s.str(a, 'placementNote', 'availability'),
    cpuModelCompatible: s.oneOf(a, 'cpuModelCompatible', 'availability', TRI, 'unknown'),
  };

  const pathsIn = s.arr(i, 'paths', 'input');
  const paths = PATH_KEYS.map((key) => {
    const v = pathsIn.find((x) => x.key === key);
    const d = emptyPath(key);
    if (!v) return d;
    const p = `paths.${key}`;
    return {
      key,
      nic: s.str(v, 'nic', p),
      dedicated: s.bool(v, 'dedicated', p, false),
      clusterTx: s.qty(v, 'clusterTx', p, BANDWIDTH_UNITS, d.clusterTx),
      clusterRx: s.qty(v, 'clusterRx', p, BANDWIDTH_UNITS, d.clusterRx),
      perNodeTx: s.qty(v, 'perNodeTx', p, BANDWIDTH_UNITS, d.perNodeTx),
      perNodeRx: s.qty(v, 'perNodeRx', p, BANDWIDTH_UNITS, d.perNodeRx),
    };
  });

  const backends = s.arr(i, 'backends', 'input').map((v, idx) => {
    const p = `backends[${idx}]`;
    const d = emptyBackend(s.str(v, 'id', p) || `sb-import-${idx}`);
    return {
      ...d,
      name: s.str(v, 'name', p),
      factor: s.str(v, 'factor', p),
      snapshotGrowth: s.qty(v, 'snapshotGrowth', p, CAPACITY_UNITS, d.snapshotGrowth),
      freePct: s.str(v, 'freePct', p),
      specReadIops: s.str(v, 'specReadIops', p),
      specWriteIops: s.str(v, 'specWriteIops', p),
      specReadTp: s.qty(v, 'specReadTp', p, THROUGHPUT_UNITS, d.specReadTp),
      specWriteTp: s.qty(v, 'specWriteTp', p, THROUGHPUT_UNITS, d.specWriteTp),
      measuredLatencyMs: s.str(v, 'measuredLatencyMs', p),
    };
  });

  const ids = new Set<string>();
  for (const v of [...vms, ...services, ...backends]) {
    if (ids.has(v.id)) s.errors.push(`ID「${v.id}」が重複しています`);
    ids.add(v.id);
  }

  const input: SizingInput = {
    cluster,
    vms,
    roles: { controlPlane: role('controlPlane'), compute: role('compute'), infra: role('infra') },
    cpMetrics: { cpuUtil: s.str(m, 'cpuUtil', 'cpMetrics'), memUtil: s.str(m, 'memUtil', 'cpMetrics'), fsyncMs: s.str(m, 'fsyncMs', 'cpMetrics'), rttMs: s.str(m, 'rttMs', 'cpMetrics') },
    services,
    availability,
    paths,
    backends,
    isSample: s.bool(i, 'isSample', 'input', false),
  };
  if (i.extraAssumptions !== undefined) {
    if (Array.isArray(i.extraAssumptions) && i.extraAssumptions.every((t) => typeof t === 'string')) input.extraAssumptions = i.extraAssumptions as string[];
    else s.errors.push('input.extraAssumptions は文字列の配列である必要があります');
  }
  let mode: InputMode = 'detail';
  let simple: SimpleInput | undefined;
  if (data.mode === 'simple') {
    const sp = parseSimple(data.simple);
    if (!sp) s.errors.push('簡易版の入力（simple）の形式が不正です');
    else {
      mode = 'simple';
      simple = sp;
    }
  } else if (data.mode !== undefined && data.mode !== 'detail') {
    s.errors.push(`mode の値「${String(data.mode)}」は不正です（simple／detail）`);
  }
  if (s.errors.length) return { ok: false, errors: s.errors };

  // 入力値の検証（現在の計算ロジックで再計算）
  const { errors } = calculateSizing(input);
  if (errors.length) {
    return { ok: false, errors: errors.map((e) => e.message) };
  }
  const warnings: string[] = [];
  if (data.result && isObj(data.result) && typeof data.result.calculatedAt === 'string') {
    warnings.push(`保存時の結果（${data.result.calculatedAt}）は参考として扱い、現在の計算ロジックで再計算しました。`);
  }
  return { ok: true, input, warnings, mode, ...(simple ? { simple } : {}) };
}
