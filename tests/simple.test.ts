import { describe, expect, it } from 'vitest';
import { calculateSizing } from '../src/domain/calc';
import { buildExport, parseImport } from '../src/domain/jsonio';
import type { ResultItem, SizingResult } from '../src/domain/result';
import { emptySimple, sampleSimple, simpleToSizingInput, type SimpleInput } from '../src/domain/simple';
import { buildSimpleView } from '../src/domain/simpleView';
import { vmMemOverheadMiB } from '../src/domain/calc/vm';

const NOW = new Date('2026-11-25T00:00:00Z');

function run(s: SimpleInput) {
  const out = calculateSizing(simpleToSizingInput(s), NOW);
  return { ...out, view: buildSimpleView(s, out.result) };
}
function item(r: SizingResult, id: string): ResultItem {
  const x = r.groups.flatMap((g) => g.sections.flatMap((s) => s.items)).find((i) => i.id === id);
  if (!x) throw new Error(id);
  return x;
}
function base(): SimpleInput {
  const s = emptySimple();
  s.vms = [{ id: 'a', name: 'A', count: '10', vcpu: '4', ram: { raw: '8', unit: 'GiB' }, disk: { raw: '100', unit: 'GiB' } }];
  s.servers = { count: '', cpu: '32', ram: { raw: '256', unit: 'GiB' } };
  return s;
}

describe('簡易版', () => {
  it('サンプルはエラーなく計算でき、判定と 3 ロールの目安が出る', () => {
    const { errors, result, view } = run(sampleSimple());
    expect(errors).toEqual([]);
    expect(result.figures.computeRequired).toBeGreaterThanOrEqual(2);
    expect(['ok', 'ng']).toContain(view.verdict.status);
    expect(view.sections.map((s) => s.title)).toEqual(expect.arrayContaining(['VM の合計', 'VM 用の物理サーバ（コンピュートノード）', 'コントロールプレーン', 'インフラノード']));
    expect(result.assumptions.some((a) => a.text.includes('簡易版の入力から計算'))).toBe(true);
  });

  it('VM の台数・サイズは同時稼働台数＝台数、CPU は選んだ割り当て比率で計算する', () => {
    const s = base();
    s.cpuRatio = '4';
    const { result } = run(s);
    expect(item(result, 'vmTotal.vcpu').value).toBe(40);
    expect(item(result, 'vmTotal.cpuReq').value).toBe(10);
    const mem = 8192 + vmMemOverheadMiB({ ramMiB: 8192, vcpu: 4, graphics: 1, sriov: 0, gpu: 0, sev: false, tpm: false });
    expect(item(result, 'vmTotal.mem').value).toBeCloseTo(10 * mem, 9);
  });

  it('物理サーバ台数が空欄なら必要台数だけを示す', () => {
    const { view, result } = run(base());
    expect(view.verdict.status).toBe('calculated');
    expect(view.verdict.headline).toContain(`${result.figures.computeRequired} 台`);
  });

  it('台数が足りなければ不足、足りれば適合', () => {
    const s = base();
    s.vms[0].count = '100';
    s.servers.count = '2';
    let r = run(s);
    expect(r.view.verdict.status).toBe('ng');
    expect(r.view.verdict.headline).toContain('不足');
    s.servers.count = String((r.result.figures.computeRequired ?? 0) + 1);
    r = run(s);
    expect(r.view.verdict.status).toBe('ok');
  });

  it('1 台に収まらない VM は台数を増やしても適合にならない', () => {
    const s = base();
    s.vms[0].vcpu = '64';
    s.servers.count = '10';
    const { view } = run(s);
    expect(view.verdict.status).toBe('ng');
  });

  it('インフラノードを使わない場合は 4 コア・2,179 MiB をコンピュートへ一度だけ計上する', () => {
    const s = base();
    s.infra = 'none';
    const { result } = run(s);
    expect(item(result, 'compute.totalCpu').value).toBe(40 + 4);
  });

  it('入力エラーは簡易版のフィールドと同じパスで返る', () => {
    const s = base();
    s.vms[0].vcpu = 'abc';
    s.servers.cpu = '-1';
    const { errors } = run(s);
    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining(['vms.a.vcpu', 'roles.compute.cpu']));
  });

  it('JSON に簡易版の入力を保存して読み戻せる', () => {
    const s = sampleSimple();
    const { result } = run(s);
    const file = buildExport(simpleToSizingInput(s), result, NOW, s);
    expect(file.mode).toBe('simple');
    const back = parseImport(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.mode).toBe('simple');
    expect(back.simple).toEqual(s);
    expect(back.input).toEqual(simpleToSizingInput(s));
  });
});
