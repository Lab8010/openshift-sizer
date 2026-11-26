/** §4.3 用語集（アプリ内の説明の正本） */
export interface GlossaryEntry {
  term: string;
  /** 本文中で自動的にツールチップを付ける表記 */
  aliases: string[];
  definition: string;
}

export const glossary: GlossaryEntry[] = [
  {
    term: 'Pod Network',
    aliases: ['Pod Network'],
    definition:
      'クラスタ標準のデフォルトネットワーク。Layer3 トポロジ固定で、全 namespace が既定で使う。インストーラが作るもので、CUDN のように後から作るものではない。',
  },
  {
    term: 'OVN-Kubernetes / OVN',
    aliases: ['OVN-Kubernetes', 'OVN'],
    definition:
      'SDN 基盤全体。VMware で言えば NSX 全体に相当する（Pod Network 単体が NSX なのではない）。',
  },
  {
    term: 'OVN Logical Switch',
    aliases: ['OVN Logical Switch'],
    definition: 'OVN 内の論理 L2 スイッチ。全ノードに分散実装される。NSX の Segment に相当。',
  },
  {
    term: 'UDN (UserDefinedNetwork)',
    aliases: ['UserDefinedNetwork', 'UDN'],
    definition:
      'namespace スコープのネットワーク宣言。Layer2 / Layer3 / Localnet のトポロジと、Primary / Secondary のロールを持つ。',
  },
  {
    term: 'CUDN (ClusterUserDefinedNetwork)',
    aliases: ['ClusterUserDefinedNetwork', 'CUDN'],
    definition:
      'UDN のクラスタスコープ版。namespaceSelector で選んだ複数 namespace に同じネットワークを提供する。vSphere のポートグループを複数 VM に配る感覚に一番近い。',
  },
  {
    term: 'NAD (NetworkAttachmentDefinition)',
    aliases: ['NetworkAttachmentDefinition', 'NAD'],
    definition:
      '「スイッチ」ではなく、VM の NIC をどのネットワークへどう繋ぐかの接続定義。Multus がこれを読んで追加 NIC を付ける。',
  },
  {
    term: 'Localnet',
    aliases: ['Localnet'],
    definition:
      'OVN の論理ネットワークを、NNCP の bridge-mapping 経由で物理ネットワーク（br-ex または専用 OVS ブリッジ、任意で VLAN）へ接続する方式。OVN の管理下に留まる、現在の本命。',
  },
  {
    term: 'Linux Bridge',
    aliases: ['Linux Bridge'],
    definition:
      'ノード OS 上のカーネルブリッジに直接繋ぐ方式。OVN をバイパスする。シンプルだが NetworkPolicy や OVN のポートセキュリティは効かない。',
  },
  {
    term: 'NNCP (NodeNetworkConfigurationPolicy)',
    aliases: ['NodeNetworkConfigurationPolicy', 'NNCP'],
    definition:
      'ノードの NIC / bond / ブリッジ / bridge-mapping など、物理寄りの配線を宣言する唯一の公式手段。API だけでは物理 NIC には触れない。',
  },
  {
    term: 'masquerade',
    aliases: ['masquerade'],
    definition: 'virt-launcher Pod 内で NAT するバインディング。Pod Network のデフォルト。',
  },
  {
    term: 'bridge バインディング',
    aliases: ['bridge バインディング'],
    definition: 'NAT なしでネットワークに直接参加するバインディング。ゲスト IP が本物のアドレスになる。',
  },
  {
    term: 'IPAM',
    aliases: ['IPAM'],
    definition:
      'IP アドレスの払い出し管理。クラスタ側で IP を配るか（Enabled / Persistent）、物理 DHCP やゲストの静的設定に任せるか（Disabled）を選ぶ。',
  },
  {
    term: 'virt-launcher Pod',
    aliases: ['virt-launcher Pod', 'virt-launcher'],
    definition: 'VM 1 台ごとに作られる Pod。VM のプロセスはこの Pod の中で動く。',
  },
];

/** §4.4 vSphere との対応表（結果画面の対応表の正本） */
export interface MappingRow {
  key: string;
  vsphere: string;
  openshift: string;
  note: string;
}

export const vsphereMapping: MappingRow[] = [
  {
    key: 'vds-def',
    vsphere: 'vCenter が保持する vDS 定義',
    openshift: 'Kubernetes API + OVN Northbound DB',
    note: '「定義は中央、実装は各ホスト / ノードに分散」が共通',
  },
  {
    key: 'esxi-vds',
    vsphere: 'ESXi ホスト上の vDS 実装',
    openshift: '各ノードの ovnkube-node + OVS',
    note: '',
  },
  {
    key: 'vss-pg',
    vsphere: '標準スイッチ (vSS) のポートグループ',
    openshift: '原則として vDS のポートグループと同じ扱いで移行先を選ぶ',
    note: '管理方式の違いを移行先選定の理由にしない',
  },
  {
    key: 'vds-pg',
    vsphere: '分散スイッチ (vDS) のポートグループ',
    openshift: 'CUDN / UDN のセグメント、または Localnet の NAD',
    note: '1 ポートグループ ≒ 1 セグメント',
  },
  {
    key: 'uplink',
    vsphere: 'アップリンク / vmnic / チーミング',
    openshift: 'ノード NIC / bond の NNCP 設定',
    note: '全ノードで同名・同構成が必須',
  },
  {
    key: 'vlan',
    vsphere: 'VLAN ID',
    openshift: 'Localnet の VLAN 設定、または NNCP 側の VLAN サブインターフェース（Linux Bridge の場合）',
    note: '方式によって「どこに書くか」が変わる点が重要',
  },
  {
    key: 'nsx-segment',
    vsphere: 'NSX Segment',
    openshift: 'OVN Logical Switch',
    note: 'NSX 経験者向けの橋渡し',
  },
  {
    key: 'nsx-dfw',
    vsphere: 'NSX Distributed Firewall',
    openshift: 'NetworkPolicy → OVN ACL',
    note: '',
  },
];
