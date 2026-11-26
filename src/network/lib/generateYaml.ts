import type { Diagnosis, ExposureType } from '../data/types';
import * as T from '../data/yamlTemplates';

export interface Params {
  namespace: string;
  vmName: string;
  vlanId: string;
  subnet: string;
  servicePort: string;
  cpu: string;
  memory: string;
  exposureType: ExposureType;
  networkScope: 'cluster' | 'namespace';
  /** 空なら vlan{{vlanId}} を自動で使う */
  physicalNetworkName: string;
  uplinkBridge: string;
  nodeInterface: string;
  /** 空なら br-vlan{{vlanId}} を自動で使う */
  linuxBridgeName: string;
  secondaryNetworkName: string;
  secondaryVlanId: string;
}

export type ParamKey = keyof Params;

export function defaultParams(d: Diagnosis): Params {
  return {
    namespace: 'vm-prod',
    vmName: 'app-vm-01',
    vlanId: '100',
    subnet: '192.168.100.0/24',
    servicePort: '8080',
    cpu: '2',
    memory: '4Gi',
    exposureType: d.defaults.exposureType,
    networkScope: d.defaults.networkScope,
    physicalNetworkName: '',
    uplinkBridge: 'br-ex',
    nodeInterface: 'bond0',
    linuxBridgeName: '',
    secondaryNetworkName: 'vlan200',
    secondaryVlanId: '200',
  };
}

/** §7.1: 診断パターンごとに表示する項目。main は最大 5 件、それ以外は「詳細設定」へ */
export function visibleParams(d: Diagnosis): { main: ParamKey[]; advanced: ParamKey[] } {
  const main: ParamKey[] = ['namespace', 'vmName'];
  const advanced: ParamKey[] = [];
  switch (d.primary) {
    case 'A':
      main.push('servicePort');
      advanced.push('exposureType');
      break;
    case 'B':
      main.push('subnet');
      advanced.push('networkScope');
      break;
    case 'C':
      main.push('vlanId');
      advanced.push('physicalNetworkName', 'uplinkBridge');
      break;
    case 'D':
      main.push('vlanId');
      advanced.push('nodeInterface', 'linuxBridgeName');
      break;
  }
  advanced.push('cpu', 'memory');
  if (d.modifiers.includes('E')) advanced.push('secondaryNetworkName', 'secondaryVlanId');
  return { main, advanced };
}

export const paramLabels: Record<ParamKey, { label: string; hint?: string }> = {
  namespace: { label: 'namespace', hint: 'VM を置く namespace' },
  vmName: { label: 'VM 名' },
  vlanId: { label: 'VLAN ID', hint: '移行元ポートグループの VLAN ID（1〜4094）' },
  subnet: { label: 'サブネット', hint: 'クラスタ内で払い出すサブネット（CIDR）' },
  servicePort: { label: '公開ポート', hint: 'VM のサービスが待ち受けているポート' },
  cpu: { label: 'CPU（コア数）' },
  memory: { label: 'メモリ', hint: '例: 4Gi' },
  exposureType: { label: '公開方法', hint: 'Q6 の回答から自動で選んでいます' },
  networkScope: { label: 'ネットワーク定義のスコープ', hint: 'Q9 の回答から自動で選んでいます' },
  physicalNetworkName: { label: 'Localnet の論理名', hint: '空欄なら vlan＋VLAN ID' },
  uplinkBridge: { label: '接続先 OVS ブリッジ', hint: 'br-ex または VM データ用の専用ブリッジ' },
  nodeInterface: { label: 'ノードの NIC / bond 名' },
  linuxBridgeName: { label: 'Linux Bridge 名', hint: '空欄なら br-vlan＋VLAN ID（15 文字以内）' },
  secondaryNetworkName: { label: '追加セグメントの論理名' },
  secondaryVlanId: { label: '追加セグメントの VLAN ID' },
};

export interface YamlFile {
  id: string;
  /** タブに出すリソース種別 */
  title: string;
  filename: string;
  content: string;
  /** 参考扱い（一括コピー / ダウンロードには含めない） */
  reference?: boolean;
}

export interface ValidationError {
  field: ParamKey;
  message: string;
}

export interface YamlResult {
  files: YamlFile[];
  /** --- 区切りで 1 つにまとめたテキスト（先頭にサンプルである旨のコメント） */
  combined: string;
  errors: ValidationError[];
}

/** 自動生成される名前を確定させた値 */
export function resolveParams(p: Params): Params {
  return {
    ...p,
    physicalNetworkName: p.physicalNetworkName.trim() || `vlan${p.vlanId.trim()}`,
    linuxBridgeName: p.linuxBridgeName.trim() || `br-vlan${p.vlanId.trim()}`,
  };
}

const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const IFACE = /^[A-Za-z0-9_.-]+$/;

function isIntIn(v: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(v)) return false;
  const n = Number(v);
  return n >= min && n <= max;
}

function isCidr(v: string): boolean {
  const m4 = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (m4) {
    return m4.slice(1, 5).every((o) => Number(o) <= 255) && Number(m4[5]) <= 32;
  }
  const m6 = v.match(/^([0-9a-fA-F:]+)\/(\d{1,3})$/);
  return !!m6 && m6[1].includes(':') && Number(m6[2]) <= 128;
}

export function validate(d: Diagnosis, raw: Params): ValidationError[] {
  const p = resolveParams(raw);
  const errors: ValidationError[] = [];
  const err = (field: ParamKey, message: string) => errors.push({ field, message });
  const { main, advanced } = visibleParams(d);
  const used = new Set<ParamKey>([...main, ...advanced]);

  const label = (field: ParamKey, maxLen: number) => {
    const v = p[field] as string;
    if (!DNS_LABEL.test(v) || v.length > maxLen) {
      err(field, `${paramLabels[field].label} は英小文字・数字・ハイフンで、先頭と末尾は英数字、${maxLen} 文字以内にしてください`);
    }
  };

  label('namespace', 63);
  label('vmName', 50);
  if (!isIntIn(p.cpu, 1, 512)) err('cpu', 'CPU は 1 以上の整数にしてください');
  if (!/^\d+(Mi|Gi)$/.test(p.memory)) err('memory', 'メモリは 4Gi や 512Mi の形式にしてください');

  if (used.has('vlanId') && !isIntIn(p.vlanId, 1, 4094)) err('vlanId', 'VLAN ID は 1〜4094 の数値にしてください');
  if (used.has('subnet') && !isCidr(p.subnet)) err('subnet', 'サブネットは 192.168.100.0/24 のような CIDR 形式にしてください');
  if (used.has('servicePort') && !isIntIn(p.servicePort, 1, 65535)) err('servicePort', 'ポートは 1〜65535 の数値にしてください');
  if (used.has('physicalNetworkName')) label('physicalNetworkName', 50);
  if (used.has('uplinkBridge') && (!IFACE.test(p.uplinkBridge) || p.uplinkBridge.length > 15)) {
    err('uplinkBridge', 'ブリッジ名は英数字・ハイフン・ドット・アンダースコアで 15 文字以内にしてください');
  }
  if (used.has('nodeInterface')) {
    if (!IFACE.test(p.nodeInterface)) {
      err('nodeInterface', 'NIC / bond 名は英数字・ハイフン・ドット・アンダースコアにしてください');
    } else if (`${p.nodeInterface}.${p.vlanId}`.length > 15) {
      err('nodeInterface', `VLAN サブインターフェース名（${p.nodeInterface}.${p.vlanId}）が 15 文字を超えます。Linux のインターフェース名の上限です`);
    }
  }
  if (used.has('linuxBridgeName')) {
    label('linuxBridgeName', 15);
  }
  if (used.has('secondaryNetworkName')) {
    label('secondaryNetworkName', 50);
    const primaryNet = d.primary === 'C' ? p.physicalNetworkName : d.primary === 'D' ? p.linuxBridgeName : 'default';
    if (p.secondaryNetworkName === primaryNet) err('secondaryNetworkName', '追加セグメントの論理名は、主となるネットワークと別の名前にしてください');
  }
  if (used.has('secondaryVlanId') && !isIntIn(p.secondaryVlanId, 1, 4094)) {
    err('secondaryVlanId', '追加セグメントの VLAN ID は 1〜4094 の数値にしてください');
  }
  return errors;
}

/** {{name}} を置換し、スニペット用プレースホルダの行を差し替える */
export function fill(template: string, values: Record<string, string>): string {
  const lines = template.split('\n').flatMap((line) => {
    const m = line.trim().match(/^\{\{(\w+)\}\}$/);
    if (m && m[1] in values && (m[1] === 'extraInterfaces' || m[1] === 'extraNetworks')) {
      const v = values[m[1]];
      return v ? v.split('\n') : [];
    }
    return [line];
  });
  return lines.join('\n').replace(/\{\{(\w+)\}\}/g, (all, key: string) => (key in values ? values[key] : all));
}

export function generateYaml(d: Diagnosis, raw: Params): YamlResult {
  const errors = validate(d, raw);
  if (errors.length > 0) return { files: [], combined: '', errors };

  const p = resolveParams(raw);
  const hasE = d.modifiers.includes('E');
  const base: Record<string, string> = {
    ...(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v).trim()])) as Record<string, string>),
    serviceType: p.exposureType === 'Route' ? 'ClusterIP' : p.exposureType,
  };
  base.extraInterfaces = hasE ? fill(T.snippetE_interface, base) : '';
  base.extraNetworks = hasE ? fill(T.snippetE_network, base) : '';

  const files: YamlFile[] = [];
  const add = (id: string, title: string, filename: string, tpl: string) =>
    files.push({ id, title, filename, content: fill(tpl, base) });

  switch (d.primary) {
    case 'A':
      add('vm', 'VirtualMachine', 'vm.yaml', T.tplA_vm);
      add('service', 'Service', 'service.yaml', T.tplA_service);
      if (p.exposureType === 'Route') add('route', 'Route', 'route.yaml', T.tplA_route);
      break;
    case 'B':
      add('namespace', 'Namespace', 'namespace.yaml', T.tplB_namespace);
      if (p.networkScope === 'cluster') {
        add('network', 'ClusterUserDefinedNetwork', 'cudn-layer2.yaml', T.tplB_cudn);
      } else {
        add('network', 'UserDefinedNetwork', 'udn-layer2.yaml', T.tplB_udn);
      }
      add('vm', 'VirtualMachine', 'vm.yaml', T.tplB_vm);
      break;
    case 'C':
      add('nncp', 'NNCP', 'nncp-bridge-mapping.yaml', T.tplC_nncp);
      add('network', 'CUDN (Localnet)', 'cudn-localnet.yaml', T.tplC_cudn);
      add('vm', 'VirtualMachine', 'vm.yaml', T.tplC_vm);
      break;
    case 'D':
      add('nncp', 'NNCP', 'nncp-linux-bridge.yaml', T.tplD_nncp);
      add('nad', 'NAD (bridge)', 'nad-bridge.yaml', T.tplD_nad);
      add('vm', 'VirtualMachine', 'vm.yaml', T.tplD_vm);
      break;
  }
  if (hasE) {
    // 追加 NIC 分は別ファイル。VM より前に適用できるよう VM の直前に置く
    const vmIndex = files.findIndex((f) => f.id === 'vm');
    files.splice(vmIndex, 0, {
      id: 'secondary',
      title: '追加 NIC (Secondary)',
      filename: 'cudn-secondary.yaml',
      content: fill(T.tplE_cudn, base),
    });
  }
  if (d.exceptionNote === 'F') {
    add('sriov', 'SR-IOV（参考）', 'sriov-reference.yaml', T.tplF_nad);
    files[files.length - 1].reference = true;
  }

  const bundle = files.filter((f) => !f.reference);
  const combined = `${T.yamlHeader}\n${bundle.map((f) => f.content).join('\n---\n')}\n`;
  return { files, combined, errors: [] };
}
