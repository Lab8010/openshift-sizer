// 公式試験表から参考点を選ぶ（このアプリの見積もりルール）。
// ノード数と Namespace 数の両方が収まる最小の行を選び、補間・外挿はしない。
import type { ScaleRow } from '../sources';

export function selectScaleRow(rows: ScaleRow[], nodes: number, namespaces: number): ScaleRow | null {
  const candidates = rows.filter((r) => r.autoSelectable && r.nodes >= nodes && r.namespaces >= namespaces);
  if (!candidates.length) return null;
  return candidates.reduce((best, r) => (r.nodes < best.nodes || (r.nodes === best.nodes && r.namespaces < best.namespaces) ? r : best));
}

export const SCALE_RULE = 'このアプリの見積もりルール：Worker 台数と Namespace 数の両方が収まる最小の試験行を参考点とする（補間・外挿なし）';
