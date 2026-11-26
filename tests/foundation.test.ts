import { describe, expect, it } from 'vitest';
import { calculateSizing } from '../src/domain/calc';
import { etcdFailureTolerance, selectPromRow } from '../src/domain/calc/foundation';
import type { ResultItem, SizingResult } from '../src/domain/result';
import { sampleInput } from '../src/domain/sample';
import { sampleSimple, simpleToSizingInput } from '../src/domain/simple';
import { buildSimpleView } from '../src/domain/simpleView';
import { OFFICIAL, SOURCES, isKnownRef } from '../src/domain/sources';
import { GiB } from '../src/domain/units';

const NOW = new Date('2026-11-26T00:00:00Z');
const item = (r: SizingResult, id: string): ResultItem => {
  const x = r.groups.flatMap((g) => g.sections.flatMap((s) => s.items)).find((i) => i.id === id);
  if (!x) throw new Error(id);
  return x;
};

describe('OpenShift 基盤の要件', () => {
  it('etcd の公式値：クォータ既定 8 GiB・最大 32 GiB、障害許容は 3 台で 1・5 台で 2', () => {
    expect(OFFICIAL.etcdQuotaDefault.value).toBe(8);
    expect(OFFICIAL.etcdQuotaMax.value).toBe(32);
    expect(etcdFailureTolerance(3)).toBe(1);
    expect(etcdFailureTolerance(4)).toBe(1);
    expect(etcdFailureTolerance(5)).toBe(2);
    expect(SOURCES['OCP-ETCD-PERF'].url).toContain('/4.22/html/etcd/etcd-performance');
  });

  it('etcd 専用ディスクの容量はクォータ既定値（8 GiB）を基準に表示する', () => {
    const { result } = calculateSizing(sampleInput(), NOW);
    expect(item(result, 'foundation.etcdSize').value).toBe(8 * GiB);
    // 実測の fsync が 10 ms 未満なら性能は適合
    expect(item(result, 'foundation.etcdPerf').status).toBe('ok');
  });

  it('Prometheus の保存量は全ノードが収まる最小の試験行を使い、200 ノードを超えると要個別評価', () => {
    expect(selectPromRow(12)?.per15DaysGB).toBe(94);
    expect(selectPromRow(50)?.nodes).toBe(50);
    expect(selectPromRow(51)?.nodes).toBe(100);
    expect(selectPromRow(201)).toBeNull();
    const x = sampleInput();
    x.roles.compute.count = '300';
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'foundation.prom').status).toBe('individual');
  });

  it('レジストリの容量が 100 GiB 未満なら不適合', () => {
    const x = sampleInput();
    const reg = x.services.find((s) => s.kind === 'registry')!;
    reg.capacity = { raw: '50', unit: 'GiB' };
    let r = calculateSizing(x, NOW).result;
    expect(item(r, 'foundation.registry').status).toBe('ng');
    reg.capacity = { raw: '500', unit: 'GiB' };
    r = calculateSizing(x, NOW).result;
    expect(item(r, 'foundation.registry').status).toBe('ok');
  });

  it('簡易版の結果に基盤の要件を出し、出典はすべて登録済み', () => {
    const s = sampleSimple();
    const { result } = calculateSizing(simpleToSizingInput(s), NOW);
    const view = buildSimpleView(s, result);
    expect(view.foundation.map((t) => t.title)).toEqual(expect.arrayContaining(['etcd 用ディスク', 'イメージレジストリ', '監視（Prometheus）の保存量']));
    expect(view.foundation.find((t) => t.title.startsWith('監視'))?.value).toContain('94 GB');
    for (const t of view.foundation) for (const r of t.refs) expect(isKnownRef(r), r).toBe(true);
    for (const r of result.usedRefs) expect(isKnownRef(r), r).toBe(true);
  });
});
