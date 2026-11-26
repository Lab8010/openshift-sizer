import { describe, expect, it } from 'vitest';
import { diagnose } from '../../src/network/lib/diagnose';
import { computePath, questions } from '../../src/network/data/questions';
import type { Answers, QuestionId } from '../../src/network/data/types';

describe('§10 テストシナリオ', () => {
  it('1: Web サーバー（LB 経由・HTTP 中心）→ A（Route 付き）', () => {
    const d = diagnose({ q1: 'name-or-lb', q6: 'service-http-only', q7: 'reconnect-ok', q8: 'single' });
    expect(d.primary).toBe('A');
    expect(d.defaults.exposureType).toBe('Route');
    expect(d.modifiers).toEqual([]);
  });

  it('2: outbound が主 → A', () => {
    const d = diagnose({ q1: 'outbound-only', q7: 'reconnect-ok' });
    expect(d.primary).toBe('A');
  });

  it('3: 基幹系（ゲスト IP 直指定・クラスタ外・VLAN 再利用・静的 IP）→ C', () => {
    const d = diagnose({
      q1: 'guest-ip-direct',
      q2: 'outside',
      q3: 'reuse-vlan',
      q4: 'static-in-guest',
      q7: 'ip-must-persist',
    });
    expect(d.primary).toBe('C');
    expect(d.alternatives).toContain('D');
  });

  it('4: システム一式を全部移行・新規サブネット OK → B', () => {
    const d = diagnose({ q1: 'guest-ip-direct', q2: 'inside-together', q3: 'new-subnet-ok', q4: 'either-ok' });
    expect(d.primary).toBe('B');
  });

  it('5: VLAN 再利用・Linux ブリッジ運用のまま・ポリシーは物理 FW → D（代替案に C）', () => {
    const d = diagnose({ q1: 'guest-ip-direct', q3: 'reuse-vlan', q10: 'policy-physical', q11: ['simple-legacy'] });
    expect(d.primary).toBe('D');
    expect(d.alternatives).toContain('C');
  });

  it('6: ケース 5 にクラスタ側ポリシー要件 → C（D は主診断にしない）', () => {
    const d = diagnose({ q1: 'guest-ip-direct', q3: 'reuse-vlan', q10: 'policy-wanted', q11: ['simple-legacy'] });
    expect(d.primary).toBe('C');
    expect(d.alternatives).toContain('D');
  });

  it('7: ポートグループが 2 つ → 主診断 + E 修飾', () => {
    const base: Answers[] = [
      { q1: 'name-or-lb', q6: 'service-http-only', q7: 'reconnect-ok' },
      { q1: 'guest-ip-direct', q2: 'outside', q3: 'reuse-vlan', q4: 'static-in-guest' },
      { q1: 'guest-ip-direct', q2: 'inside-together', q3: 'new-subnet-ok', q4: 'either-ok' },
      { q1: 'guest-ip-direct', q3: 'reuse-vlan', q10: 'policy-physical', q11: ['simple-legacy'] },
    ];
    for (const b of base) {
      const without = diagnose({ ...b, q8: 'single' });
      const withE = diagnose({ ...b, q8: 'multiple' });
      expect(withE.primary).toBe(without.primary);
      expect(withE.modifiers).toContain('E');
    }
  });

  it('8: L2 依存アプリ（Q1 は名前経由）→ A にならず B / C、理由に L2 依存', () => {
    const d = diagnose({ q1: 'name-or-lb', q5: 'l2-dependent' });
    expect(d.primary).not.toBe('A');
    expect(['B', 'C']).toContain(d.primary);
    expect(d.reasons.some((r) => r.questionId === 'q5' && r.text.includes('同一セグメント'))).toBe(true);
  });
});

describe('§6.2 共通ルール', () => {
  it('Q7 = IP 不変が必須なら masquerade（A）を主診断にしない', () => {
    const d = diagnose({ q1: 'name-or-lb', q6: 'service-ok', q5: 'l2-none', q7: 'ip-must-persist' });
    expect(d.primary).not.toBe('A');
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it('Q6 = 寄せられない ならゲスト IP 維持ルートで再判定', () => {
    const d = diagnose({ q1: 'name-or-lb', q6: 'service-ng', q2: 'outside', q3: 'reuse-vlan' });
    expect(d.primary).toBe('C');
  });

  it('Q6 = できる なら LoadBalancer を初期値にする', () => {
    expect(diagnose({ q1: 'name-or-lb', q6: 'service-ok' }).defaults.exposureType).toBe('LoadBalancer');
  });

  it('Q2 = 全部一緒 でも VLAN 再利用なら C、代替案に B', () => {
    const d = diagnose({ q1: 'guest-ip-direct', q2: 'inside-together', q3: 'reuse-vlan' });
    expect(d.primary).toBe('C');
    expect(d.alternatives).toContain('B');
  });

  it('クラスタ外の相手 + 新規サブネットでよい なら C、代替案に B（BGP の経路広報）', () => {
    const d = diagnose({ q1: 'guest-ip-direct', q2: 'outside', q3: 'new-subnet-ok' });
    expect(d.primary).toBe('C');
    expect(d.alternatives).toEqual(['D', 'B']);
  });

  it('Q9 = 多数で共有 なら CUDN、それ以外は UDN', () => {
    const b = { q1: 'guest-ip-direct', q2: 'inside-together', q3: 'new-subnet-ok' };
    expect(diagnose({ ...b, q9: 'shared-many' }).defaults.networkScope).toBe('cluster');
    expect(diagnose({ ...b, q9: 'vm-team-only' }).defaults.networkScope).toBe('namespace');
  });

  it('Q11 = 高性能 なら F を例外枠に添え、主診断は変えない', () => {
    const b: Answers = { q1: 'guest-ip-direct', q2: 'outside', q3: 'reuse-vlan', q10: 'policy-none' };
    const d = diagnose({ ...b, q11: ['high-performance'] });
    expect(d.exceptionNote).toBe('F');
    expect(d.primary).toBe(diagnose({ ...b, q11: ['none'] }).primary);
  });

  it('「分からない」は安全側に倒し、要確認としてチェックリストに残す', () => {
    const d = diagnose({ q1: 'unknown', q2: 'unknown', q3: 'unknown' });
    expect(d.primary).toBe('C');
    expect(d.checklist[0]).toMatch(/^要確認/);
    expect(d.unknowns).toEqual(['q1', 'q2', 'q3']);
  });

  it('経路から外れた古い回答は診断に使わない', () => {
    // 一度ゲスト IP ルートで Q2/Q3 に答えた後、Q1 を名前経由に変えた
    const d = diagnose({ q1: 'name-or-lb', q6: 'service-ok', q5: 'l2-none', q7: 'reconnect-ok', q2: 'outside', q3: 'reuse-vlan' });
    expect(d.primary).toBe('A');
  });
});

describe('§5.2 の分岐', () => {
  it('Pod Network ルートは Q1 → Q6 → Q5 → Q7 → Q8 で終わる', () => {
    expect(computePath({ q1: 'name-or-lb', q6: 'service-ok', q5: 'l2-none', q7: 'reconnect-ok' })).toEqual([
      'q1', 'q6', 'q5', 'q7', 'q8',
    ]);
  });

  it('Pod Network ルートで A が除外されたら Q2 → Q3 → Q4 へ合流する', () => {
    expect(computePath({ q1: 'name-or-lb', q6: 'service-ok', q5: 'l2-dependent', q7: 'reconnect-ok' })).toEqual([
      'q1', 'q6', 'q5', 'q7', 'q2', 'q3', 'q4', 'q8', 'q9', 'q10', 'q11',
    ]);
  });

  it('Q6 = 寄せられない なら Q2 へ戻る', () => {
    expect(computePath({ q1: 'outbound-only', q6: 'service-ng' }).slice(0, 4)).toEqual(['q1', 'q6', 'q2', 'q3']);
  });

  it('ゲスト IP ルート（B）は Q9 で終わる', () => {
    expect(computePath({ q1: 'guest-ip-direct', q2: 'inside-together', q3: 'new-subnet-ok' })).toEqual([
      'q1', 'q2', 'q3', 'q4', 'q5', 'q7', 'q8', 'q9',
    ]);
  });

  it('物理 L2 ルートは Q10・Q11 まで聞く（最大 11 問）', () => {
    const p = computePath({ q1: 'guest-ip-direct', q2: 'outside' });
    expect(p).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q7', 'q8', 'q9', 'q10', 'q11']);
    const longest = computePath({ q1: 'name-or-lb', q6: 'service-ng', q2: 'outside' });
    expect(longest.length).toBe(11);
  });
});

describe('§1.4 / §5.4 シンプルさと意思決定支援', () => {
  const all = Object.values(questions);

  it('選択肢は 2〜4 個、全選択肢に example と consequence、全質問に unsureHint', () => {
    for (const q of all) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.options.length, q.id).toBeLessThanOrEqual(4);
      expect(q.unsureHint.length, q.id).toBeGreaterThan(0);
      for (const o of q.options) {
        expect(o.example.length, `${q.id}/${o.value}`).toBeGreaterThan(0);
        expect(o.example.length, `${q.id}/${o.value} example は 60 字程度まで`).toBeLessThanOrEqual(60);
        expect(o.consequence.length, `${q.id}/${o.value}`).toBeGreaterThan(0);
      }
    }
  });

  it('「分からない」選択肢は常に最後', () => {
    for (const q of all) {
      const idx = q.options.findIndex((o) => o.value === 'unknown');
      if (idx >= 0) expect(idx, q.id).toBe(q.options.length - 1);
    }
  });

  it('全経路で、理由 2 件以上・チェックリスト 7 件以下', () => {
    // 各質問の全選択肢の組み合わせを経路に沿って列挙する
    const results: Answers[] = [];
    const walk = (answers: Answers) => {
      const path = computePath(answers);
      const next = path.find((id) => answers[id] === undefined) as QuestionId | undefined;
      if (!next) {
        results.push(answers);
        return;
      }
      const q = questions[next];
      if (q.type === 'multi') {
        for (const v of [['none'], ['simple-legacy'], ['high-performance'], ['ovn-trouble-avoid', 'high-performance']]) {
          walk({ ...answers, [next]: v });
        }
      } else {
        for (const o of q.options) walk({ ...answers, [next]: o.value });
      }
    };
    walk({});
    expect(results.length).toBeGreaterThan(100);
    for (const r of results) {
      const d = diagnose(r);
      expect(d.reasons.length, JSON.stringify(r)).toBeGreaterThanOrEqual(2);
      expect(d.checklist.length, JSON.stringify(r)).toBeLessThanOrEqual(7);
      expect(computePath(r).length).toBeLessThanOrEqual(11);
      if (r.q7 === 'ip-must-persist' || r.q5 === 'l2-dependent') expect(d.primary, JSON.stringify(r)).not.toBe('A');
    }
  });
});
