// 候補ノードとインストール最低要件・ローカルディスクの照合（ロール共通）。
import { has, type NV, type RoleN } from '../parse';
import { fmt, fmtBytes, type ResultItem } from '../result';
import { GB, GiB } from '../units';
import { b, nonEmpty, nvText, off, T } from './helpers';
import type { OfficialId } from '../sources';

interface InstallIds {
  cpu: OfficialId;
  ram: OfficialId;
  disk: OfficialId;
  iops: OfficialId;
}

export function installMinItems(role: RoleN, prefix: string, ids: InstallIds): ResultItem[] {
  const out: ResultItem[] = [];
  const cmp = (
    key: string,
    name: string,
    cand: NV,
    id: OfficialId,
    toCand: (v: number) => number,
    reqText: string,
    candText: (v: number) => string,
  ) => {
    const req = off(id);
    const c = cand;
    if (c.k !== 'v') {
      out.push({
        id: `${prefix}.install.${key}`,
        label: `${name}：インストール最低要件（1 台）`,
        kind: 'official_min',
        status: c.k === 'na' ? 'na' : 'unconfirmed',
        text: `${reqText}（候補仕様が未入力のため照合未確認）`,
        refs: [id],
        missing: c.k === 'na' ? undefined : [`候補${name}`],
      });
      return;
    }
    const candVal = toCand(c.v);
    out.push({
      id: `${prefix}.install.${key}`,
      label: `${name}：インストール最低要件（1 台）`,
      kind: 'official_min',
      status: candVal >= req ? 'ok' : 'ng',
      text: `最低 ${reqText} ／ 候補 ${candText(c.v)}`,
      refs: [id],
    });
  };
  cmp('cpu', 'CPU', role.cpu, ids.cpu, (v) => v, `${off(ids.cpu)} vCPU`, (v) => `${fmt(v)} vCPU`);
  cmp('ram', 'メモリ', role.ramMiB, ids.ram, (mib) => (mib * 2 ** 20) / GB, `${off(ids.ram)} GB`, (mib) => `${fmt((mib * 2 ** 20) / GB)} GB（${fmt(mib / 1024)} GiB）`);
  cmp('disk', 'ストレージ', role.diskBytes, ids.disk, (bytes) => bytes / GB, `${off(ids.disk)} GB`, (bytes) => fmtBytes(bytes));
  cmp('iops', 'IOPS', role.iops, ids.iops, (v) => v, `${off(ids.iops)} IOPS`, (v) => `${fmt(v)} IOPS`);
  return out;
}

/** ローカルディスク：Virtualization の 10 GiB と、消費見積もりとの照合 */
export function localDiskItems(role: RoleN, prefix: string): ResultItem[] {
  const virt = off('virtStoragePerNode') * GiB;
  const out: ResultItem[] = [
    {
      id: `${prefix}.virtDisk`,
      label: 'Virtualization 導入によるディスク消費（1 台）',
      kind: 'official_default',
      status: 'calculated',
      value: virt,
      unit: 'bytes',
      refs: ['virtStoragePerNode'],
      note: 'インストール最低容量とは別行で表示。ゲストの永続ディスクは共有ストレージ側で集計',
    },
  ];
  if (!has(role.localEstimateBytes) || !has(role.diskBytes)) {
    out.push({
      id: `${prefix}.localFit`,
      label: 'ローカルディスクの余裕（消費見積もり + Virtualization 分）',
      kind: 'derived',
      status: role.localEstimateBytes.k === 'na' ? 'na' : 'unconfirmed',
      missing: nonEmpty([
        ...(has(role.localEstimateBytes) || role.localEstimateBytes.k === 'na' ? [] : ['OS・イメージ・ログ・etcd・一時領域の消費見積もり']),
        ...(has(role.diskBytes) ? [] : ['候補ローカルディスク']),
      ]),
      basis: [b('消費見積もり', T.bytes(role.localEstimateBytes)), b('候補ローカルディスク', T.bytes(role.diskBytes))],
    });
    return out;
  }
  const need = role.localEstimateBytes.v + virt;
  const cand = role.diskBytes.v;
  out.push({
    id: `${prefix}.localFit`,
    label: 'ローカルディスクの余裕（消費見積もり + Virtualization 分）',
    kind: 'derived',
    status: cand >= need ? 'ok' : 'ng',
    value: cand - need,
    unit: 'bytes',
    text: cand >= need ? '（残り）' : '（不足）',
    formula: '候補ローカルディスク − (消費見積もり + 10 GiB)',
    basis: [b('消費見積もり', fmtBytes(role.localEstimateBytes.v)), b('Virtualization 分', fmtBytes(virt)), b('候補ローカルディスク', fmtBytes(cand))],
    refs: ['virtStoragePerNode'],
  });
  return out;
}

export function countText(n: RoleN['count']): string {
  return nvText(n, (v) => `${fmt(v)} 台`);
}
