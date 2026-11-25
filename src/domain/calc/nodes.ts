// ノードの Allocatable とシステム予約（OCP-NODES §6.12.1）。
import { has, type RoleN } from '../parse';
import { fmt, fmtMiB, type ResultItem } from '../result';
import { b, need, off, T } from './helpers';

/** システム予約 CPU の自動計算（コア）。§6.12.1 */
export function autoSystemReservedCpu(cores: number): number {
  const calc = 0.06 + 0.012 * Math.max(0, cores - 1);
  return Math.max(off('sysReservedCpuFloor'), calc);
}

/** システム予約メモリの自動計算（MiB）。§6.12.1 の段階的な割合 */
export function autoSystemReservedMemMiB(memMiB: number): number {
  const gib = memMiB / 1024;
  const tiers: [number, number][] = [
    [4, 0.25],
    [4, 0.2],
    [8, 0.1],
    [112, 0.06],
    [Infinity, 0.02],
  ];
  let rest = gib;
  let reserved = 0;
  for (const [size, rate] of tiers) {
    if (rest <= 0) break;
    const part = Math.min(rest, size);
    reserved += part * rate;
    rest -= part;
  }
  return reserved * 1024;
}

export interface Allocatable {
  cpu: number | null;
  memMiB: number | null;
  items: ResultItem[];
  missingCpu: string[];
  missingMem: string[];
}

export function calcAllocatable(role: RoleN, prefix: string, roleLabel: string): Allocatable {
  const items: ResultItem[] = [];
  const missingCpu: string[] = [];
  const missingMem: string[] = [];
  let cpu: number | null = null;
  let mem: number | null = null;

  // CPU
  if (has(role.allocCpu)) {
    cpu = role.allocCpu.v;
    items.push({ id: `${prefix}.allocCpu`, label: `${roleLabel}の Allocatable CPU（1 台）`, kind: 'input', status: 'calculated', value: cpu, unit: 'cores', note: '既存クラスタの Allocatable 入力を優先' });
  } else {
    const cap = need(role.cpu, '候補 CPU', missingCpu);
    let res: number | null = null;
    let resKind: ResultItem['kind'] = 'input';
    if (has(role.sysResCpu)) res = role.sysResCpu.v;
    else if (role.autoSysReserved && cap !== null) {
      res = autoSystemReservedCpu(cap);
      resKind = 'derived';
    } else if (!role.autoSysReserved) missingCpu.push('システム予約 CPU（または自動計算を有効化）');
    if (res !== null) {
      items.push({
        id: `${prefix}.sysResCpu`,
        label: `${roleLabel}のシステム予約 CPU（1 台）`,
        kind: resKind,
        status: 'calculated',
        value: res,
        unit: 'cores',
        formula: resKind === 'derived' ? 'max(0.5, 0.06 + 0.012 × (コア数 − 1))（公式の自動計算式）' : undefined,
        refs: resKind === 'derived' ? ['sysReservedCpuFloor'] : undefined,
      });
    }
    if (cap !== null && res !== null) cpu = Math.max(0, cap - res);
    items.push({
      id: `${prefix}.allocCpu`,
      label: `${roleLabel}の Allocatable CPU（1 台）`,
      kind: 'derived',
      status: cpu === null ? 'not_calculated' : 'calculated',
      value: cpu ?? undefined,
      unit: 'cores',
      formula: 'max(0, ノード容量 − システム予約)（CPU のハード Eviction しきい値はなし）',
      basis: [b('ノード容量', T.num(role.cpu)), b('システム予約', res !== null ? fmt(res) : '未算出')],
      refs: ['OCP-NODES'],
      missing: missingCpu.length ? missingCpu : undefined,
    });
  }

  // メモリ
  if (has(role.allocMemMiB)) {
    mem = role.allocMemMiB.v;
    items.push({ id: `${prefix}.allocMem`, label: `${roleLabel}の Allocatable メモリ（1 台）`, kind: 'input', status: 'calculated', value: mem, unit: 'mib', note: '既存クラスタの Allocatable 入力を優先' });
  } else {
    const cap = need(role.ramMiB, '候補メモリ', missingMem);
    let res: number | null = null;
    let resKind: ResultItem['kind'] = 'input';
    if (has(role.sysResMemMiB)) res = role.sysResMemMiB.v;
    else if (role.autoSysReserved && cap !== null) {
      res = autoSystemReservedMemMiB(cap);
      resKind = 'derived';
    } else if (!role.autoSysReserved) missingMem.push('システム予約メモリ（または自動計算を有効化）');
    if (res !== null) {
      items.push({
        id: `${prefix}.sysResMem`,
        label: `${roleLabel}のシステム予約メモリ（1 台）`,
        kind: resKind,
        status: 'calculated',
        value: res,
        unit: 'mib',
        formula: resKind === 'derived' ? '最初の 4 GiB の 25% + 次の 4 GiB の 20% + 次の 8 GiB の 10% + 次の 112 GiB の 6% + 128 GiB 超の 2%（公式の自動計算式）' : undefined,
        refs: resKind === 'derived' ? ['OCP-NODES'] : undefined,
      });
    }
    const ev = need(role.evictionMemMiB, 'ハード Eviction しきい値（メモリ）', missingMem);
    if (cap !== null && res !== null && ev !== null) mem = Math.max(0, cap - res - ev);
    items.push({
      id: `${prefix}.allocMem`,
      label: `${roleLabel}の Allocatable メモリ（1 台）`,
      kind: 'derived',
      status: mem === null ? 'not_calculated' : 'calculated',
      value: mem ?? undefined,
      unit: 'mib',
      formula: 'max(0, ノード容量 − システム予約 − ハード Eviction しきい値)',
      basis: [b('ノード容量', T.mib(role.ramMiB)), b('システム予約', res !== null ? fmtMiB(res) : '未算出'), b('ハード Eviction しきい値', T.mib(role.evictionMemMiB))],
      refs: ['OCP-NODES'],
      missing: missingMem.length ? missingMem : undefined,
    });
  }
  return { cpu, memMiB: mem, items, missingCpu, missingMem };
}
