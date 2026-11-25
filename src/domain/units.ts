// 単位の定義と変換。計算途中では丸めない。
// 1 GiB = 2^30 bytes、1 GB = 10^9 bytes、1 Mbps = 10^6 bit/s。

export const CAPACITY_UNITS = ['MiB', 'GiB', 'TiB', 'MB', 'GB', 'TB'] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number];

export const MEMORY_UNITS = ['MiB', 'GiB', 'MB', 'GB'] as const;
export type MemoryUnit = (typeof MEMORY_UNITS)[number];

export const THROUGHPUT_UNITS = ['MiB/s', 'MB/s'] as const;
export type ThroughputUnit = (typeof THROUGHPUT_UNITS)[number];

export const BANDWIDTH_UNITS = ['Mbps', 'Gbps'] as const;
export type BandwidthUnit = (typeof BANDWIDTH_UNITS)[number];

export const MiB = 2 ** 20;
export const GiB = 2 ** 30;
export const TiB = 2 ** 40;
export const MB = 1e6;
export const GB = 1e9;
export const TB = 1e12;

const BYTES_PER: Record<CapacityUnit, number> = {
  MiB,
  GiB,
  TiB,
  MB,
  GB,
  TB,
};

export function capacityToBytes(value: number, unit: CapacityUnit): number {
  return value * BYTES_PER[unit];
}

export function bytesTo(bytes: number, unit: CapacityUnit): number {
  return bytes / BYTES_PER[unit];
}

export function memoryToMiB(value: number, unit: MemoryUnit): number {
  return capacityToBytes(value, unit) / MiB;
}

export function throughputToBytesPerSec(value: number, unit: ThroughputUnit): number {
  return unit === 'MiB/s' ? value * MiB : value * MB;
}

export function bandwidthToBitsPerSec(value: number, unit: BandwidthUnit): number {
  return unit === 'Mbps' ? value * 1e6 : value * 1e9;
}

export function bitsPerSecToMbps(bps: number): number {
  return bps / 1e6;
}

export function isUnit<T extends readonly string[]>(list: T, u: unknown): u is T[number] {
  return typeof u === 'string' && (list as readonly string[]).includes(u);
}
