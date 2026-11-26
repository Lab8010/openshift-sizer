// 計算結果の型と、表示文字列の生成（画面・印刷・JSON で共通）。
import { GB, GiB, MiB } from './units';

/** 値の状態 */
export type Status =
  | 'ok' // 適合
  | 'ng' // 不適合
  | 'calculated' // 算出済み
  | 'not_calculated' // 未算出
  | 'unconfirmed' // 未確認
  | 'individual' // 要個別評価
  | 'na' // 対象外
  | 'info'; // 参考

export const STATUS_LABEL: Record<Status, string> = {
  ok: '適合',
  ng: '不適合',
  calculated: '算出済み',
  not_calculated: '未算出',
  unconfirmed: '未確認',
  individual: '要個別評価',
  na: '対象外',
  info: '参考',
};

/** 印刷（モノクロ）でも読める記号 */
export const STATUS_MARK: Record<Status, string> = {
  ok: '○',
  ng: '×',
  calculated: '＝',
  not_calculated: '－',
  unconfirmed: '？',
  individual: '△',
  na: '／',
  info: '・',
};

/** 値の種類 */
export type Kind =
  | 'official_min'
  | 'official_rec'
  | 'official_default'
  | 'input'
  | 'measured'
  | 'derived'
  | 'assumption'
  | 'sample';

export const KIND_LABEL: Record<Kind, string> = {
  official_min: '公式最低要件',
  official_rec: '公式の推奨・試験値',
  official_default: '公式の既定値・近似値',
  input: '入力値',
  measured: '入力値（実測）',
  derived: '入力からの算出値',
  assumption: 'このアプリの仮定',
  sample: 'サンプル値',
};

export type ValueUnit =
  | 'cores'
  | 'vcpu'
  | 'mib'
  | 'bytes'
  | 'bps'
  | 'Bps'
  | 'iops'
  | 'ms'
  | 'pct'
  | 'count'
  | 'nodes'
  | 'pods'
  | 'days'
  | 'sec'
  | 'factor';

export interface BasisLine {
  label: string;
  value: string;
}

export interface ResultItem {
  id: string;
  label: string;
  kind: Kind;
  status: Status;
  value?: number;
  unit?: ValueUnit;
  /** 数値以外の表示（value がない場合の本文） */
  text?: string;
  /** 表示用文字列（finalize で生成） */
  display?: string;
  formula?: string;
  basis?: BasisLine[];
  /** 出典（OFFICIAL・試験表の ID または資料 ID） */
  refs?: string[];
  missing?: string[];
  note?: string;
}

export interface Table {
  caption?: string;
  columns: string[];
  rows: string[][];
}

export interface Section {
  id: string;
  title: string;
  items: ResultItem[];
  tables?: Table[];
  notes?: string[];
}

export interface SummaryCell {
  lines: string[];
  status?: Status;
}

export interface SummaryRow {
  role: string;
  count: SummaryCell;
  cpuPer: SummaryCell;
  cpuTotal: SummaryCell;
  memPer: SummaryCell;
  memTotal: SummaryCell;
  localPer: SummaryCell;
  localTotal: SummaryCell;
  shared: SummaryCell;
  network: SummaryCell;
}

export interface OpenItem {
  groupId: string;
  itemId: string;
  sectionTitle: string;
  label: string;
  status: Status;
  detail: string;
}

export interface Assumption {
  kind: Kind;
  text: string;
}

/** 簡易版の表示などに使う主要な数値 */
export interface KeyFigures {
  computeRequired: number | null;
  computeRequiredStatus: Status;
  computeCandidate: number | null;
  computeCandidateStatus: Status;
  computeUnavailable: number | null;
  vmCpuPerNode: number | null;
  vmMemPerNodeMiB: number | null;
  totalCpuDemand: number | null;
  totalMemDemandMiB: number | null;
  cpPerNodeCpu: number;
  cpPerNodeMemGB: number;
  cpRowStatus: Status;
  cpRowId: string | null;
  infraEnabled: boolean;
  infraRowStatus: Status;
  infraRowId: string | null;
  infraPerNodeGuideCpu: number | null;
  infraPerNodeGuideMemMiB: number | null;
  vmLogicalBytes: number | null;
  physicalBytes: number | null;
}

export interface SizingResult {
  calculatedAt: string;
  product: { ocp: string; virt: string };
  inputErrorCount: number;
  assumptions: Assumption[];
  summary: SummaryRow[];
  groups: { id: string; title: string; sections: Section[] }[];
  openItems: OpenItem[];
  usedRefs: string[];
  figures: KeyFigures;
}

// ---- 数値の表示 ----

const nf = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });
export const fmt = (n: number): string => nf.format(n);

export function fmtMiB(mib: number): string {
  return `${fmt(mib)} MiB（${fmt(mib / 1024)} GiB）`;
}

export function fmtBytes(bytes: number): string {
  if (Math.abs(bytes) >= 1024 * GiB) {
    return `${fmt(bytes / (1024 * GiB))} TiB（${fmt(bytes / 1e12)} TB）`;
  }
  if (Math.abs(bytes) >= GiB || bytes === 0) {
    return `${fmt(bytes / GiB)} GiB（${fmt(bytes / GB)} GB）`;
  }
  return `${fmt(bytes / MiB)} MiB（${fmt(bytes / 1e6)} MB）`;
}

export function fmtBps(bps: number): string {
  const mbps = bps / 1e6;
  return mbps >= 1000 ? `${fmt(mbps)} Mbps（${fmt(mbps / 1000)} Gbps）` : `${fmt(mbps)} Mbps`;
}

export function fmtValue(value: number, unit: ValueUnit): string {
  switch (unit) {
    case 'cores':
      return `${fmt(value)} コア`;
    case 'vcpu':
      return `${fmt(value)} vCPU`;
    case 'mib':
      return fmtMiB(value);
    case 'bytes':
      return fmtBytes(value);
    case 'bps':
      return fmtBps(value);
    case 'Bps':
      return `${fmt(value / MiB)} MiB/s（${fmt(value / 1e6)} MB/s）`;
    case 'iops':
      return `${fmt(value)} IOPS`;
    case 'ms':
      return `${fmt(value)} ms`;
    case 'pct':
      return `${fmt(value)} %`;
    case 'count':
      return `${fmt(value)}`;
    case 'nodes':
      return `${fmt(value)} 台`;
    case 'pods':
      return `${fmt(value)} Pod`;
    case 'days':
      return `${fmt(value)} 日`;
    case 'sec':
      return `${fmt(value)} 秒`;
    case 'factor':
      return `× ${fmt(value)}`;
  }
}

export function displayOf(item: ResultItem): string {
  if (item.value !== undefined && item.unit) {
    const v = fmtValue(item.value, item.unit);
    return item.text ? `${v}　${item.text}` : v;
  }
  if (item.text) return item.text;
  return STATUS_LABEL[item.status];
}
