import type { Answers, QuestionId } from '../data/types';

/** 単一選択の回答を取り出す（未回答・複数選択は undefined） */
export function single(answers: Answers, id: QuestionId): string | undefined {
  const v = answers[id];
  return typeof v === 'string' ? v : undefined;
}

/** 複数選択の回答を取り出す */
export function multi(answers: Answers, id: QuestionId): string[] {
  const v = answers[id];
  return Array.isArray(v) ? v : [];
}

/** Q1 が「名前 / LB 経由」または「outbound が主」 */
export function isPodish(a: Answers): boolean {
  const q1 = single(a, 'q1');
  return q1 === 'name-or-lb' || q1 === 'outbound-only';
}

/** Pod Network ルートに入っていて、Q6 で「寄せられない」とは答えていない */
export function podRouteOpen(a: Answers): boolean {
  return isPodish(a) && single(a, 'q6') !== 'service-ng';
}

/**
 * Pod Network ルートの途中で、パターン A では満たせない回答が出た。
 * Q5 = L2 依存あり（または分からない）、Q7 = IP 不変が必須（または分からない）。
 */
export function aExcludedOnPodRoute(a: Answers): boolean {
  if (!podRouteOpen(a)) return false;
  const q5 = single(a, 'q5');
  const q7 = single(a, 'q7');
  return q5 === 'l2-dependent' || q5 === 'unknown' || q7 === 'ip-must-persist' || q7 === 'unknown';
}

/** パターン A（Pod Network）で確定するルート */
export function isPodRoute(a: Answers): boolean {
  return podRouteOpen(a) && !aExcludedOnPodRoute(a);
}

/** ゲスト IP を宛先として維持するルート（B / C / D） */
export function isGuestRoute(a: Answers): boolean {
  return !isPodRoute(a);
}

/** 接続相手が全部クラスタ内へ移り、新規サブネットでよい（パターン B） */
export function isOverlayRoute(a: Answers): boolean {
  return isGuestRoute(a) && single(a, 'q2') === 'inside-together' && single(a, 'q3') === 'new-subnet-ok';
}

/** 物理 L2 へ出るルート（パターン C / D） */
export function isPhysicalRoute(a: Answers): boolean {
  return isGuestRoute(a) && !isOverlayRoute(a);
}
