// インフラサービス（監視・Ingress・レジストリ・ログ・その他）の要求量と保存量。
import { has, type ServiceN, type SizingModel } from '../parse';
import { fmt, type ResultItem } from '../result';
import { PLACEMENT_LABELS, type Placement } from '../types';
import { b, need, nvText, off, sum, T } from './helpers';

export interface PlacementLoad {
  cpu: number;
  memMiB: number;
  /** 要求量が未入力のサービス名 */
  missing: string[];
  services: string[];
}

export interface ServiceStorage {
  serviceId: string;
  name: string;
  backendId: string;
  logicalBytes: number | null;
  pvBytes: number | null;
}

export interface ServicesCalc {
  byPlacement: Record<Placement, PlacementLoad>;
  /** 試験（監視・標準 Ingress・Registry）に含まれないサービスの要求量（インフラ配置分） */
  additionalOnInfra: PlacementLoad;
  storage: ServiceStorage[];
  ingressPeakBps: number | null;
  items: ResultItem[];
}

/** 公式試験の適用範囲に含まれるサービス */
export const IN_TEST_SCOPE = new Set(['monitoring', 'ingress', 'registry']);

function emptyLoad(): PlacementLoad {
  return { cpu: 0, memMiB: 0, missing: [], services: [] };
}

export function calcServices(model: SizingModel): ServicesCalc {
  const byPlacement: Record<Placement, PlacementLoad> = {
    infra: emptyLoad(),
    compute: emptyLoad(),
    controlPlane: emptyLoad(),
    external: emptyLoad(),
    none: emptyLoad(),
  };
  const additionalOnInfra = emptyLoad();
  const items: ResultItem[] = [];
  const storage: ServiceStorage[] = [];
  let ingressPeakBps: number | null = null;

  for (const s of model.services) {
    const placement = !model.infraEnabled && s.placement === 'infra' ? 'compute' : s.placement;
    const active = placement !== 'none';
    const id = `svc.${s.id}`;
    if (!active) {
      items.push({ id: `${id}.req`, label: `${s.name}：要求量`, kind: 'input', status: 'na', text: '導入しない' });
      continue;
    }
    const placeNote = placement !== s.placement ? '（インフラノードを使わない構成のため、コンピュートへ計上）' : '';
    const missing: string[] = [];
    const rep = need(s.replicas, 'レプリカ数', missing);
    const cpu = need(s.cpu, 'CPU 要求量', missing);
    const mem = need(s.memMiB, 'メモリ要求量', missing);
    const ok = rep !== null && cpu !== null && mem !== null;
    if (placement !== 'external') {
      const load = byPlacement[placement];
      load.services.push(s.name);
      if (ok) {
        load.cpu += rep * cpu;
        load.memMiB += rep * mem;
      } else load.missing.push(s.name);
      if (placement === 'infra' && !IN_TEST_SCOPE.has(s.kind)) {
        additionalOnInfra.services.push(s.name);
        if (ok) {
          additionalOnInfra.cpu += rep * cpu;
          additionalOnInfra.memMiB += rep * mem;
        } else additionalOnInfra.missing.push(s.name);
      }
    }
    items.push({
      id: `${id}.req`,
      label: `${s.name}：CPU・メモリ要求量（合計、配置先 ${PLACEMENT_LABELS[placement]}）${placeNote}`,
      kind: 'derived',
      status: placement === 'external' ? 'na' : ok ? 'calculated' : 'not_calculated',
      text: placement === 'external' ? 'クラスタ外のため計上しない' : ok ? `CPU ${fmt(rep * cpu)} コア、メモリ ${fmt(rep * mem)} MiB（${fmt((rep * mem) / 1024)} GiB）` : undefined,
      formula: 'レプリカ数 × 1 レプリカあたりの要求量',
      basis: [b('レプリカ数', nvText(s.replicas)), b('CPU（1 レプリカ）', T.num(s.cpu)), b('メモリ（1 レプリカ）', T.mib(s.memMiB))],
      note: IN_TEST_SCOPE.has(s.kind) ? '公式試験（§2.3.1）の適用範囲に含まれるサービス。試験の参考サイズへは重複加算しない' : '公式試験に含まれない追加サービス。独立した要求量として表示',
      missing: missing.length && placement !== 'external' ? missing : undefined,
    });

    // 保存量
    const st = serviceStorage(s, id, items);
    if (st) storage.push(st);

    if (s.kind === 'ingress' && has(s.peakBps)) ingressPeakBps = (ingressPeakBps ?? 0) + s.peakBps.v;
    if (s.kind === 'ingress') {
      items.push({
        id: `${id}.peak`,
        label: `${s.name}：ピーク帯域（クラスタ合計）`,
        kind: 'input',
        status: has(s.peakBps) ? 'calculated' : s.peakBps.k === 'na' ? 'na' : 'unconfirmed',
        value: has(s.peakBps) ? s.peakBps.v : undefined,
        unit: 'bps',
        note: s.requestRate ? `リクエスト量: ${s.requestRate}` : undefined,
        missing: has(s.peakBps) || s.peakBps.k === 'na' ? undefined : ['Ingress のピーク帯域'],
      });
    }
    if (s.kind === 'monitoring' && (has(s.timeSeries) || has(s.scrapeSec))) {
      items.push({
        id: `${id}.series`,
        label: `${s.name}：時系列数・収集間隔（記録）`,
        kind: 'input',
        status: 'info',
        text: `時系列数 ${nvText(s.timeSeries)}、収集間隔 ${nvText(s.scrapeSec)} 秒`,
        note: '時系列数と収集間隔は Prometheus のメモリ・保存量に影響する。このアプリはこれらから容量を自動計算しない',
      });
    }
  }
  return { byPlacement, additionalOnInfra, storage, ingressPeakBps, items };
}

function serviceStorage(s: ServiceN, id: string, items: ResultItem[]): ServiceStorage | null {
  if (s.kind === 'ingress') return null;
  if (s.kind === 'monitoring') {
    const usedDefault = !has(s.retentionDays);
    const retention = has(s.retentionDays) ? s.retentionDays.v : off('promRetentionDefault');
    items.push({
      id: `${id}.retention`,
      label: `${s.name}：保持期間`,
      kind: usedDefault ? 'official_default' : 'input',
      status: 'calculated',
      value: retention,
      unit: 'days',
      refs: usedDefault ? ['promRetentionDefault'] : undefined,
      note: usedDefault ? 'プラットフォーム監視の既定値 15 日を使用' : undefined,
    });
    if (s.perReplicaPerDayBytes.k === 'empty' || s.perReplicaPerDayBytes.k === 'na') {
      items.push({
        id: `${id}.storage`,
        label: `${s.name}：保存量（論理）`,
        kind: 'derived',
        status: s.perReplicaPerDayBytes.k === 'na' ? 'na' : 'not_calculated',
        missing: s.perReplicaPerDayBytes.k === 'na' ? undefined : ['1 レプリカ・1 日あたりの実効保存量'],
        refs: ['MON-STORAGE'],
      });
      return null;
    }
    const missing: string[] = [];
    const per = need(s.perReplicaPerDayBytes, '1 レプリカ・1 日あたりの実効保存量', missing);
    const rep = need(s.replicas, 'レプリカ数', missing);
    const logical = per !== null && rep !== null ? per * retention * rep : null;
    const free = has(s.pvFreePct) ? s.pvFreePct.v : null;
    const pv = logical !== null && free !== null ? logical / (1 - free / 100) : null;
    items.push({
      id: `${id}.storage`,
      label: `${s.name}：保存量（論理、全レプリカ）`,
      kind: 'derived',
      status: logical === null ? 'not_calculated' : 'calculated',
      value: logical ?? undefined,
      unit: 'bytes',
      formula: '1 レプリカ・1 日あたりの実効保存量 × 保持日数 × レプリカ数（実効保存量には圧縮等の影響を含む）',
      basis: [b('1 日あたり実効保存量', T.bytes(s.perReplicaPerDayBytes)), b('保持日数', fmt(retention)), b('レプリカ数', nvText(s.replicas))],
      refs: ['MON-STORAGE'],
      missing: missing.length ? missing : undefined,
    });
    items.push(pvItem(id, s, logical, pv));
    return { serviceId: s.id, name: s.name, backendId: s.backendId, logicalBytes: logical, pvBytes: pv };
  }
  // registry / logging / other
  if (s.capacityBytes.k === 'empty' && s.kind === 'other') return null;
  const logical = has(s.capacityBytes) ? s.capacityBytes.v : null;
  items.push({
    id: `${id}.storage`,
    label: `${s.name}：保存量（論理）`,
    kind: 'input',
    status: logical !== null ? 'calculated' : s.capacityBytes.k === 'na' ? 'na' : 'not_calculated',
    value: logical ?? undefined,
    unit: 'bytes',
    missing: logical === null && s.capacityBytes.k !== 'na' ? ['実効保存量'] : undefined,
  });
  if (logical === null) return null;
  const free = has(s.pvFreePct) ? s.pvFreePct.v : null;
  const pv = free !== null ? logical / (1 - free / 100) : null;
  items.push(pvItem(id, s, logical, pv));
  return { serviceId: s.id, name: s.name, backendId: s.backendId, logicalBytes: logical, pvBytes: pv };
}

function pvItem(id: string, s: ServiceN, logical: number | null, pv: number | null): ResultItem {
  return {
    id: `${id}.pv`,
    label: `${s.name}：PV 容量（空き容量を含む）`,
    kind: 'derived',
    status: pv !== null ? 'calculated' : logical === null ? 'not_calculated' : 'unconfirmed',
    value: pv ?? undefined,
    unit: 'bytes',
    formula: '論理保存量 ÷ (1 − PV の空き容量比率)',
    basis: [b('PV の空き容量比率', nvText(s.pvFreePct, (v) => `${fmt(v)} %`))],
    missing: pv === null && logical !== null ? ['PV の空き容量比率'] : undefined,
  };
}

export function sumLoads(...loads: PlacementLoad[]): PlacementLoad {
  return {
    cpu: sum(loads.map((l) => l.cpu)),
    memMiB: sum(loads.map((l) => l.memMiB)),
    missing: loads.flatMap((l) => l.missing),
    services: loads.flatMap((l) => l.services),
  };
}
