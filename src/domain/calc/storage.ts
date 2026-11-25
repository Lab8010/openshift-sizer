// 共有ストレージ（VM ディスク・サービス保存量）の容量と性能。
import { has, type BackendN, type NV, type SizingModel, type VmN } from '../parse';
import { fmt, fmtBytes, type ResultItem, type Section, type Status, type Table } from '../result';
import { b, sum } from './helpers';
import type { ServicesCalc } from './services';
import type { VmCalc } from './vm';

export interface BackendCalc {
  id: string;
  name: string;
  logicalBytes: number | null;
  physicalBytes: number | null;
  status: Status;
}

export interface StorageCalc {
  sections: Section[];
  backends: BackendCalc[];
  vmLogicalBytes: number | null;
  physicalTotalBytes: number | null;
  items: ResultItem[];
}

const UNSPECIFIED = '__unspecified__';

function perfSum(vms: VmN[], calcs: VmCalc[], pick: (v: VmN) => NV): { value: number | null; partial: number; missing: string[]; na: boolean } {
  const missing: string[] = [];
  const vals: number[] = [];
  let allNa = vms.length > 0;
  vms.forEach((v) => {
    const c = calcs.find((x) => x.id === v.id);
    const n = pick(v);
    if (n.k === 'na') return;
    allNa = false;
    if (has(n) && c && c.running !== null) vals.push(n.v * c.running);
    else missing.push(v.name);
  });
  return { value: missing.length ? null : sum(vals), partial: sum(vals), missing, na: allNa };
}

export function calcStorage(model: SizingModel, calcs: VmCalc[], svc: ServicesCalc): StorageCalc {
  const known = new Map(model.backends.map((x) => [x.id, x]));
  const keyOf = (id: string) => (known.has(id) ? id : UNSPECIFIED);
  const keys = new Set<string>();
  model.vms.forEach((v) => keys.add(keyOf(v.backendId)));
  svc.storage.forEach((s) => keys.add(keyOf(s.backendId)));
  model.backends.forEach((x) => keys.add(x.id));

  const sections: Section[] = [];
  const backends: BackendCalc[] = [];
  const allItems: ResultItem[] = [];
  const summaryRows: string[][] = [];

  for (const key of keys) {
    const be: BackendN | undefined = known.get(key);
    const name = be ? be.name : 'バックエンド未指定';
    const P = `storage.${key === UNSPECIFIED ? 'unspecified' : key}`;
    const vms = model.vms.filter((v) => keyOf(v.backendId) === key);
    const svcs = svc.storage.filter((s) => keyOf(s.backendId) === key);
    const items: ResultItem[] = [];

    // 論理容量
    const vmMissing: string[] = [];
    const vmVals: number[] = [];
    vms.forEach((v) => {
      const c = calcs.find((x) => x.id === v.id);
      if (v.diskBytes.k === 'na') return;
      if (c && c.defined !== null && c.diskBytes !== null) vmVals.push(c.defined * c.diskBytes);
      else vmMissing.push(v.name);
    });
    const svcMissing = svcs.filter((s) => s.logicalBytes === null).map((s) => s.name);
    const svcVals = svcs.filter((s) => s.logicalBytes !== null).map((s) => s.logicalBytes as number);
    const vmLogical = vmMissing.length ? null : sum(vmVals);
    const logical = vmMissing.length || svcMissing.length ? null : sum(vmVals) + sum(svcVals);
    items.push({
      id: `${P}.vmLogical`,
      label: 'VM ディスクの論理容量',
      kind: 'derived',
      status: vmLogical === null ? 'not_calculated' : vms.length ? 'calculated' : 'na',
      value: vmLogical ?? undefined,
      unit: 'bytes',
      formula: 'Σ（定義台数 × 1 台あたりの永続ディスク論理容量）',
      basis: vms.map((v) => {
        const c = calcs.find((x) => x.id === v.id);
        return b(v.name, c && c.defined !== null && c.diskBytes !== null ? `${fmt(c.defined)} 台 × ${fmtBytes(c.diskBytes)}` : '未算出');
      }),
      refs: ['VIRT-INSTALL'],
      missing: vmMissing.length ? vmMissing.map((n) => `VM「${n}」の定義台数・ディスク容量`) : undefined,
      note: vmMissing.length && sum(vmVals) > 0 ? `入力済み分の部分合計: ${fmtBytes(sum(vmVals))}` : undefined,
    });
    if (svcs.length) {
      items.push({
        id: `${P}.svcLogical`,
        label: 'サービス保存量の論理容量（監視・レジストリ・ログ等）',
        kind: 'derived',
        status: svcMissing.length ? 'not_calculated' : 'calculated',
        value: svcMissing.length ? undefined : sum(svcVals),
        unit: 'bytes',
        basis: svcs.map((s) => b(s.name, s.logicalBytes !== null ? fmtBytes(s.logicalBytes) : '未算出')),
        missing: svcMissing.length ? svcMissing : undefined,
      });
    }
    items.push({
      id: `${P}.logical`,
      label: '論理容量（合計）',
      kind: 'derived',
      status: logical === null ? 'not_calculated' : 'calculated',
      value: logical ?? undefined,
      unit: 'bytes',
      missing: logical === null ? [...vmMissing, ...svcMissing] : undefined,
    });

    // 物理容量
    let physical: number | null = null;
    let physStatus: Status = 'not_calculated';
    const physMissing: string[] = [];
    const notes: string[] = [];
    if (!be) physMissing.push('ストレージバックエンドの登録（物理容量係数）');
    else if (!has(be.factor)) physMissing.push('物理容量係数');
    if (logical === null) physMissing.push('論理容量');
    if (be && has(be.factor) && logical !== null) {
      const snap = has(be.snapshotGrowthBytes) ? be.snapshotGrowthBytes.v : null;
      const free = has(be.freePct) ? be.freePct.v : null;
      if (snap === null) notes.push('スナップショット・増加見込みが未入力のため含まない');
      if (free === null) notes.push('空き容量比率が未入力のため含まない');
      physical = ((logical + (snap ?? 0)) * be.factor.v) / (1 - (free ?? 0) / 100);
      physStatus = snap === null || free === null ? 'unconfirmed' : 'calculated';
    }
    items.push({
      id: `${P}.physical`,
      label: physStatus === 'unconfirmed' ? '物理容量（下限。未入力の項目を含まない）' : '物理容量',
      kind: 'derived',
      status: physStatus,
      value: physical ?? undefined,
      unit: 'bytes',
      formula: '(論理容量 + 論理ベースのスナップショット・増加量) × 物理容量係数 ÷ (1 − 空き容量比率)（このツールの試算式）',
      basis: be
        ? [
            b('論理容量', logical !== null ? fmtBytes(logical) : '未算出'),
            b('スナップショット・増加量', has(be.snapshotGrowthBytes) ? fmtBytes(be.snapshotGrowthBytes.v) : '未入力'),
            b('物理容量係数', has(be.factor) ? fmt(be.factor.v) : '未入力'),
            b('空き容量比率', has(be.freePct) ? `${fmt(be.freePct.v)} %` : '未入力'),
          ]
        : undefined,
      note: notes.length ? notes.join('。') : undefined,
      missing: physMissing.length ? physMissing : notes.length ? notes.map((n) => n.replace('が未入力のため含まない', '')) : undefined,
    });

    // 性能
    const rI = perfSum(vms, calcs, (v) => v.readIops);
    const wI = perfSum(vms, calcs, (v) => v.writeIops);
    const rB = perfSum(vms, calcs, (v) => v.readBps);
    const wB = perfSum(vms, calcs, (v) => v.writeBps);
    const perf = (id: string, label: string, s: ReturnType<typeof perfSum>, spec: NV | undefined, unit: 'iops' | 'Bps'): ResultItem => {
      const specOk = spec && has(spec);
      let status: Status;
      if (s.na) status = 'na';
      else if (s.value === null) status = 'not_calculated';
      else if (!specOk) status = 'unconfirmed';
      else status = s.value <= (spec as { v: number }).v ? 'ok' : 'ng';
      const fmtV = (v: number) => (unit === 'iops' ? `${fmt(v)} IOPS` : `${fmt(v / 2 ** 20)} MiB/s`);
      return {
        id: `${P}.${id}`,
        label,
        kind: 'derived',
        status,
        value: s.value ?? undefined,
        unit,
        text: s.value !== null ? `／ 仕様・測定 ${specOk ? fmtV((spec as { v: number }).v) : '未入力'}` : undefined,
        formula: 'Σ（最大同時稼働台数 × 1 台あたりのピーク値）。同時ピークを前提とした合計',
        missing: s.value === null && !s.na ? s.missing.map((n) => `VM「${n}」の${label}`) : !specOk && !s.na ? ['バックエンドの仕様または測定結果'] : undefined,
        note: s.value === null && s.partial > 0 ? `入力済み分の部分合計: ${fmtV(s.partial)}` : undefined,
      };
    };
    items.push(perf('readIops', 'ピーク読み込み IOPS', rI, be?.specReadIops, 'iops'));
    items.push(perf('writeIops', 'ピーク書き込み IOPS', wI, be?.specWriteIops, 'iops'));
    items.push(perf('readBps', 'ピーク読み込みスループット', rB, be?.specReadBps, 'Bps'));
    items.push(perf('writeBps', 'ピーク書き込みスループット', wB, be?.specWriteBps, 'Bps'));
    const lat = vms.filter((v) => has(v.latencyMs)).map((v) => (v.latencyMs as { v: number }).v);
    const latReq = lat.length ? Math.min(...lat) : null;
    const latMeasured = be && has(be.measuredLatencyMs) ? be.measuredLatencyMs.v : null;
    items.push({
      id: `${P}.latency`,
      label: '許容レイテンシ（最も厳しい VM）と測定値',
      kind: 'derived',
      status: latReq === null ? (vms.every((v) => v.latencyMs.k === 'na') && vms.length ? 'na' : 'not_calculated') : latMeasured === null ? 'unconfirmed' : latMeasured <= latReq ? 'ok' : 'ng',
      value: latReq ?? undefined,
      unit: 'ms',
      text: latReq !== null ? `以下 ／ 測定 ${latMeasured !== null ? `${fmt(latMeasured)} ms` : '未入力'}` : undefined,
      missing: latReq === null ? ['VM の許容レイテンシ'] : latMeasured === null ? ['バックエンドの実測レイテンシ'] : undefined,
    });
    items.push({
      id: `${P}.note`,
      label: 'ストレージの公式要件',
      kind: 'official_min',
      status: 'info',
      text: 'OpenShift Container Platform がサポートするストレージと、既定のストレージクラスが必要。ノードのローカルディスクと PVC の同じ消費は合算しない',
      refs: ['storage'],
    });

    sections.push({ id: `storage-${key}`, title: `ストレージ：${name}`, items });
    allItems.push(...items);
    backends.push({ id: key, name, logicalBytes: logical, physicalBytes: physical, status: physStatus });
    summaryRows.push([
      name,
      logical !== null ? fmtBytes(logical) : '未算出',
      physical !== null ? `${fmtBytes(physical)}${physStatus === 'unconfirmed' ? '（下限）' : ''}` : '未算出',
      rI.value !== null ? `${fmt(rI.value)} / ${wI.value !== null ? fmt(wI.value) : '未算出'}` : '未算出',
    ]);
  }

  // RWX（ライブマイグレーション対象）
  const rwxItems: ResultItem[] = model.vms
    .filter((v) => v.migratable)
    .map((v) => ({
      id: `storage.rwx.${v.id}`,
      label: `VM「${v.name}」の RWX（ライブマイグレーション対象）`,
      kind: 'input' as const,
      status: (v.rwx === 'yes' ? 'ok' : v.rwx === 'no' ? 'ng' : 'unconfirmed') as Status,
      text: v.rwx === 'yes' ? 'RWX 対応' : v.rwx === 'no' ? 'RWX 非対応のためライブマイグレーションできない' : 'RWX 対応が未確認',
      refs: ['migration'],
    }));
  if (rwxItems.length) {
    sections.push({ id: 'storage-rwx', title: 'ライブマイグレーションのための RWX', items: rwxItems });
    allItems.push(...rwxItems);
  }

  const vmAll = calcs.every((c) => c.defined !== null && c.diskBytes !== null) ? sum(calcs.map((c) => (c.defined as number) * (c.diskBytes as number))) : null;
  const physAll = backends.every((x) => x.physicalBytes !== null) && backends.length ? sum(backends.map((x) => x.physicalBytes as number)) : null;
  const table: Table = { columns: ['バックエンド', '論理容量', '物理容量', '読み / 書き IOPS（ピーク合計）'], rows: summaryRows };
  if (summaryRows.length) sections.unshift({ id: 'storage-overview', title: 'バックエンド別の集計', items: [], tables: [table] });
  return { sections, backends, vmLogicalBytes: vmAll, physicalTotalBytes: physAll, items: allItems };
}
