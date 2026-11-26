// ネットワーク構成診断とサイジングの連携（純粋関数）。
import { computePath, questions } from '../network/data/questions';
import { patterns } from '../network/data/patterns';
import type { Answers, Diagnosis, QuestionId } from '../network/data/types';
import { diagnose } from '../network/lib/diagnose';

export interface NetworkState {
  answers: Answers;
  /** すべての質問に答え終わっているか */
  complete: boolean;
  diagnosis: Diagnosis | null;
}

export function networkState(answers: Answers): NetworkState {
  const started = Object.keys(answers).length > 0;
  const complete = started && computePath(answers).every((id) => answers[id] !== undefined);
  return { answers, complete, diagnosis: complete ? diagnose(answers) : null };
}

/** サイジングの結果・レポートに載せる、ネットワーク診断の要約 */
export interface NetworkSummary {
  patternId: string;
  title: string;
  conclusion: string;
  guestIpReachable: boolean;
  multihome: boolean;
  sriov: boolean;
  reasons: string[];
  warnings: string[];
  checklist: string[];
  unknowns: string[];
}

export function networkSummary(d: Diagnosis): NetworkSummary {
  const p = patterns[d.primary];
  return {
    patternId: p.id,
    title: `パターン ${p.id}: ${p.shortName}`,
    conclusion: p.conclusion,
    guestIpReachable: p.guestIpReachable,
    multihome: d.modifiers.includes('E'),
    sriov: d.exceptionNote === 'F',
    reasons: d.reasons.map((r) => `${r.answerLabel} → ${r.text}`),
    warnings: d.warnings,
    checklist: d.checklist,
    unknowns: d.unknowns.map((id) => questions[id].title),
  };
}

/** ネットワーク構成のうち、サーバ・NIC の準備やサイジングに関わる確認事項 */
export function networkSizingChecks(d: Diagnosis): { text: string; refs: string[] }[] {
  const out: { text: string; refs: string[] }[] = [];
  if (d.primary === 'C' || d.primary === 'D') {
    out.push({
      text: `ネットワーク診断はパターン ${d.primary}（${patterns[d.primary].shortName}）です。VM 用の VLAN を、VM を載せる物理サーバの NIC へトランクで出す必要があります。VM 用に NIC（またはボンディング）を分けるかと、その帯域を確かめてください`,
      refs: ['VIRT-INSTALL'],
    });
  }
  if (d.modifiers.includes('E')) {
    out.push({ text: 'VM が複数のネットワークに繋がります（マルチホーム）。追加 NIC 用のネットワークを物理サーバ側でも用意してください', refs: ['VIRT-INSTALL'] });
  }
  if (d.exceptionNote === 'F') {
    out.push({
      text: 'SR-IOV を検討しています。SR-IOV に対応した NIC と、使う VM の台数分の VF（仮想ファンクション）を用意し、ライブマイグレーションへの影響を確かめてください。SR-IOV を使う VM を選ぶと、VM の追加メモリ（1 デバイスあたり 1 GiB）を計算に含めます',
      refs: ['vmMemOverheadPerDevice', 'migration'],
    });
  }
  return out;
}

const VALID_IDS = new Set(Object.keys(questions));

/** JSON・保存データからネットワークの回答を復元する。形式が不正なら null */
export function parseNetworkAnswers(v: unknown): Answers | null {
  if (v === undefined) return {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const out: Answers = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!VALID_IDS.has(k)) return null;
    const q = questions[k as QuestionId];
    const allowed = new Set(q.options.map((o) => o.value));
    if (q.type === 'multi') {
      if (!Array.isArray(val) || !val.every((x) => typeof x === 'string' && allowed.has(x))) return null;
      out[k as QuestionId] = val as string[];
    } else {
      if (typeof val !== 'string' || !allowed.has(val)) return null;
      out[k as QuestionId] = val;
    }
  }
  return out;
}
