import type { NV } from '../parse';
import { has } from '../parse';
import { fmt, fmtBps, fmtBytes, fmtMiB, type BasisLine, type ResultItem } from '../result';
import { OFFICIAL, type OfficialId } from '../sources';

export function off(id: OfficialId): number {
  return OFFICIAL[id].value;
}

export function nvText(n: NV, f: (v: number) => string = fmt): string {
  switch (n.k) {
    case 'v':
      return f(n.v);
    case 'empty':
      return '未入力';
    case 'na':
      return '対象外';
    case 'invalid':
      return '入力エラー';
  }
}

export const T = {
  mib: (n: NV) => nvText(n, fmtMiB),
  bytes: (n: NV) => nvText(n, fmtBytes),
  bps: (n: NV) => nvText(n, fmtBps),
  num: (n: NV) => nvText(n),
};

/** 計算に必要な値。未入力・対象外・エラーなら missing に追加して null */
export function need(n: NV, label: string, missing: string[]): number | null {
  if (has(n)) return n.v;
  missing.push(n.k === 'invalid' ? `${label}（入力エラー）` : n.k === 'na' ? `${label}（対象外）` : label);
  return null;
}

export function b(label: string, value: string): BasisLine {
  return { label, value };
}

export function sum(xs: number[]): number {
  return xs.reduce((a, c) => a + c, 0);
}

export function item(x: ResultItem): ResultItem {
  return x;
}

/** 大小比較による適合判定 */
export function geCheck(candidate: number, required: number): 'ok' | 'ng' {
  return candidate >= required ? 'ok' : 'ng';
}

export function nonEmpty<T>(xs: T[]): T[] | undefined {
  return xs.length ? xs : undefined;
}
