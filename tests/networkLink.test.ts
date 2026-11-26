import { describe, expect, it } from 'vitest';
import { calculateSizing } from '../src/domain/calc';
import { buildExport, parseImport } from '../src/domain/jsonio';
import { networkSizingChecks, networkState, networkSummary, parseNetworkAnswers } from '../src/domain/networkLink';
import type { ResultItem } from '../src/domain/result';
import { sampleSimple, simpleToSizingInput } from '../src/domain/simple';
import type { Answers } from '../src/network/data/types';

const NOW = new Date('2026-11-26T00:00:00Z');
/** 全問回答済みで、パターン C・SR-IOV の検討ありになる回答 */
const C_WITH_SRIOV: Answers = {
  q1: 'guest-ip-direct',
  q2: 'outside',
  q3: 'reuse-vlan',
  q4: 'static-in-guest',
  q5: 'l2-dependent',
  q7: 'ip-must-persist',
  q8: 'single',
  q9: 'shared-many',
  q10: 'policy-wanted',
  q11: ['simple-legacy', 'high-performance'],
};
const item = (r: ReturnType<typeof calculateSizing>['result'], id: string): ResultItem | undefined =>
  r.groups.flatMap((g) => g.sections.flatMap((s) => s.items)).find((i) => i.id === id);

describe('ネットワーク診断との連携', () => {
  it('回答途中は診断なし、全問回答で診断結果を返す', () => {
    expect(networkState({}).diagnosis).toBeNull();
    expect(networkState({ q1: 'guest-ip-direct' }).complete).toBe(false);
    const n = networkState(C_WITH_SRIOV);
    expect(n.complete).toBe(true);
    expect(n.diagnosis?.primary).toBe('C');
    expect(n.diagnosis?.exceptionNote).toBe('F');
    expect(networkSummary(n.diagnosis!).title).toContain('Localnet');
  });

  it('パターン C と SR-IOV は物理サーバ側の確認事項を出す', () => {
    const checks = networkSizingChecks(networkState(C_WITH_SRIOV).diagnosis!).map((c) => c.text).join('\n');
    expect(checks).toContain('トランク');
    expect(checks).toContain('SR-IOV');
  });

  it('SR-IOV を使う VM を選ぶと、1 デバイスあたり 1,024 MiB の追加メモリと要個別評価が計算に入る', () => {
    const s = sampleSimple();
    const d = networkState(C_WITH_SRIOV).diagnosis;
    const before = calculateSizing(simpleToSizingInput(s, d), NOW).result;
    s.sriov = { vmIds: ['svm-db'], devicesPerVm: '2' };
    const after = calculateSizing(simpleToSizingInput(s, d), NOW).result;
    const diff = (item(after, 'vm.svm-db.memOverhead')!.value as number) - (item(before, 'vm.svm-db.memOverhead')!.value as number);
    expect(diff).toBe(2048);
    expect(item(after, 'compute.required')!.status).toBe('individual');
    expect(after.assumptions.some((a) => a.text.includes('SR-IOV'))).toBe(true);
    expect(after.assumptions.some((a) => a.text.includes('パターン C'))).toBe(true);
  });

  it('JSON にネットワークの回答を保存して読み戻せる。不正な回答は読み込まない', () => {
    const s = sampleSimple();
    const input = simpleToSizingInput(s);
    const file = buildExport(input, calculateSizing(input, NOW).result, NOW, s, C_WITH_SRIOV);
    const back = parseImport(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.networkAnswers).toEqual(C_WITH_SRIOV);
    expect(parseNetworkAnswers({ q1: 'no-such-option' })).toBeNull();
    expect(parseNetworkAnswers({ q99: 'x' })).toBeNull();
    const bad = { ...file, network: { answers: { q1: 'no-such-option' } } };
    expect(parseImport(JSON.stringify(bad)).ok).toBe(false);
  });
});
