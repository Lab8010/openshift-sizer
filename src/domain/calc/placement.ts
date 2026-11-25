// 同一仕様ノードへの簡易配置（このアプリの見積もりルール）。
// VM を要求量の大きい順に、CPU とメモリの空きが最も多く残るノードへ置く（分散配置に近い）。
// NUMA、アフィニティ、特殊デバイスは扱わない。

export interface PlaceGroup {
  key: string;
  name: string;
  cpu: number;
  memMiB: number;
  count: number;
}

export interface NodeCapacity {
  cpu: number;
  memMiB: number;
  /** 1 台に置ける VM（Pod）数の上限。未入力なら Infinity */
  pods: number;
}

export interface NodeLoad {
  cpu: number;
  memMiB: number;
  pods: number;
  counts: Record<string, number>;
}

export interface PlacementResult {
  ok: boolean;
  nodeCount: number;
  nodes: NodeLoad[];
  failed?: { key: string; name: string; reason: string };
  /** ノードごとの VM メモリ要求量合計の最大値 */
  maxNodeMemMiB: number;
  freeMemMiB: number;
}

const EPS = 1e-9;

export function fitsEmptyNode(g: PlaceGroup, cap: NodeCapacity): string | null {
  if (g.cpu > cap.cpu + EPS) return 'CPU 要求量が 1 台の VM 用 CPU を超えます';
  if (g.memMiB > cap.memMiB + EPS) return 'メモリ要求量が 1 台の VM 用メモリを超えます';
  if (cap.pods < 1) return 'Pod 枠がありません';
  return null;
}

export function place(groups: PlaceGroup[], nodeCount: number, cap: NodeCapacity): PlacementResult {
  const nodes: NodeLoad[] = Array.from({ length: Math.max(0, nodeCount) }, () => ({ cpu: 0, memMiB: 0, pods: 0, counts: {} }));
  const share = (cpu: number, mem: number) => Math.max(cap.cpu > 0 ? cpu / cap.cpu : cpu > 0 ? Infinity : 0, cap.memMiB > 0 ? mem / cap.memMiB : mem > 0 ? Infinity : 0);
  const sorted = [...groups].filter((g) => g.count > 0).sort((a, b) => share(b.cpu, b.memMiB) - share(a.cpu, a.memMiB));
  const done = (ok: boolean, failed?: PlacementResult['failed']): PlacementResult => {
    const maxNodeMemMiB = nodes.reduce((m, n) => Math.max(m, n.memMiB), 0);
    const freeMemMiB = nodes.reduce((s, n) => s + (cap.memMiB - n.memMiB), 0);
    return { ok, nodeCount, nodes, failed, maxNodeMemMiB, freeMemMiB };
  };
  for (const g of sorted) {
    const reason = fitsEmptyNode(g, cap);
    if (reason) return done(false, { key: g.key, name: g.name, reason });
    for (let i = 0; i < g.count; i++) {
      let best = -1;
      let bestScore = -Infinity;
      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        const cpuAfter = node.cpu + g.cpu;
        const memAfter = node.memMiB + g.memMiB;
        if (cpuAfter > cap.cpu + EPS || memAfter > cap.memMiB + EPS || node.pods + 1 > cap.pods) continue;
        const score = -share(cpuAfter, memAfter);
        if (score > bestScore) {
          bestScore = score;
          best = n;
        }
      }
      if (best < 0) return done(false, { key: g.key, name: g.name, reason: '空きのあるノードがありません' });
      const node = nodes[best];
      node.cpu += g.cpu;
      node.memMiB += g.memMiB;
      node.pods += 1;
      node.counts[g.key] = (node.counts[g.key] ?? 0) + 1;
    }
  }
  return done(true);
}

/**
 * 条件を満たす最小のノード数を探す。lower 以上、upper 以下。
 * 判定は台数に対して単調と仮定し、指数探索の後に二分探索する。
 */
export function findMinNodes(lower: number, upper: number, ok: (n: number) => boolean): number | null {
  let lo = Math.max(1, lower);
  if (lo > upper) return null;
  if (ok(lo)) return lo;
  let step = 1;
  let hi = lo + step;
  while (hi <= upper && !ok(hi)) {
    lo = hi;
    step *= 2;
    hi = lo + step;
  }
  if (hi > upper) {
    if (!ok(upper)) return null;
    hi = upper;
  }
  // lo は不可、hi は可
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
