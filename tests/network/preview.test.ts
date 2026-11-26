import { describe, expect, it } from 'vitest';
import { previewDiagnosis } from '../../src/network/lib/preview';
import { defaultParams, generateYaml } from '../../src/network/lib/generateYaml';
import { compareRows } from '../../src/network/data/patterns';

describe('パターン一覧（診断なしのプレビュー）', () => {
  it('A〜D それぞれ、何も入力せずに YAML が生成できる', () => {
    for (const p of ['A', 'B', 'C', 'D'] as const) {
      const d = previewDiagnosis(p);
      const r = generateYaml(d, defaultParams(d));
      expect(r.errors, p).toEqual([]);
      expect(r.files.length, p).toBeGreaterThanOrEqual(2);
      expect(d.checklist.length).toBeLessThanOrEqual(7);
    }
  });

  it('比較表は全行で A〜D がそろっている', () => {
    for (const row of compareRows) {
      for (const p of ['A', 'B', 'C', 'D'] as const) expect(row.cells[p].text.length, `${row.label}/${p}`).toBeGreaterThan(0);
    }
  });
});
