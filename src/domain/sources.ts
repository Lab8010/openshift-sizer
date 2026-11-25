// 公式参照データの唯一の登録場所。
// 画面・印刷用ビュー・JSON はすべてここを参照する。値を他のファイルへ直接書かない。
// 章節アンカーは遷移を確認していないため使わず、章ページの URL と章節番号を表示する。

export const PRODUCT = {
  ocp: 'OpenShift Container Platform 4.22',
  virt: 'OpenShift Virtualization 4.22',
  version: '4.22',
} as const;

/** 免責事項（画面冒頭・印刷レポート・README で共通） */
export const DISCLAIMER = {
  title: '免責事項',
  text: '本ツールは有志が作成した非公式のサイジングツールです。環境固有のワークロード特性などは判定できないため、本ツールから得られる情報はあくまで参考としてご利用ください。最終的な構成は、Red Hat の公式ドキュメントと実環境での検証に基づいて判断してください。',
} as const;

export type SourceId =
  | 'OCP-INSTALL'
  | 'OCP-SCALE'
  | 'OCP-ETCD'
  | 'OCP-NODES'
  | 'VIRT-INSTALL'
  | 'VIRT-VM'
  | 'VIRT-LIMITS'
  | 'VIRT-MIG'
  | 'MON-STORAGE';

export interface SourceDoc {
  id: SourceId;
  product: string;
  version: string;
  title: string;
  /** 資料内で参照する章節 */
  sections: string;
  /** 対応箇所の説明 */
  scope: string;
  url: string;
}

const DOCS = 'https://docs.redhat.com/en/documentation';

export const SOURCES: Record<SourceId, SourceDoc> = {
  'OCP-INSTALL': {
    id: 'OCP-INSTALL',
    product: PRODUCT.ocp,
    version: '4.22',
    title: 'Installing a cluster on any platform',
    sections: '§1.3.1–1.3.2、表 1.1・表 1.2',
    scope: 'ノードの台数とインストール最低要件',
    url: `${DOCS}/openshift_container_platform/4.22/html-single/installing_on_any_platform/index`,
  },
  'OCP-SCALE': {
    id: 'OCP-SCALE',
    product: PRODUCT.ocp,
    version: '4.22',
    title: 'Recommended performance and scalability practices',
    sections: '§2.1.2、§2.3.1',
    scope: 'コントロールプレーンとインフラの試験結果、適用条件',
    url: `${DOCS}/openshift_container_platform/4.22/html/scalability_and_performance/recommended-performance-and-scalability-practices`,
  },
  'OCP-ETCD': {
    id: 'OCP-ETCD',
    product: PRODUCT.ocp,
    version: '4.22',
    title: 'Recommended etcd practices',
    sections: '§2.1–2.3',
    scope: '同期書き込み、fsync、メンバー間 RTT',
    url: `${DOCS}/openshift_container_platform/4.22/html/etcd/etcd-practices`,
  },
  'OCP-NODES': {
    id: 'OCP-NODES',
    product: PRODUCT.ocp,
    version: '4.22',
    title: 'Working with nodes',
    sections: '§6.5、§6.12.1',
    scope: 'Pod 上限と Allocatable',
    url: `${DOCS}/openshift_container_platform/4.22/html/nodes/working-with-nodes`,
  },
  'VIRT-INSTALL': {
    id: 'VIRT-INSTALL',
    product: PRODUCT.virt,
    version: '4.22',
    title: 'Installing OpenShift Virtualization',
    sections: '§4.1–4.2',
    scope: '対応プラットフォーム、CPU・OS・ストレージ、Virtualization の追加負荷、移行要件',
    url: `${DOCS}/openshift_container_platform/4.22/html/virtualization/installing`,
  },
  'VIRT-VM': {
    id: 'VIRT-VM',
    product: PRODUCT.virt,
    version: '4.22',
    title: 'Managing VMs',
    sections: '§8.18.14',
    scope: '専用 CPU と共有 CPU、割り当て比率',
    url: `${DOCS}/openshift_container_platform/4.22/html/virtualization/managing-vms`,
  },
  'VIRT-LIMITS': {
    id: 'VIRT-LIMITS',
    product: PRODUCT.virt,
    version: '4.22',
    title: 'OpenShift Virtualization 4.22 documentation（Supported limits）',
    sections: '§1.2',
    scope: 'Virtualization の VM・ホスト・クラスタの試験上限',
    url: `${DOCS}/openshift_container_platform/4.22/html-single/virtualization/index`,
  },
  'VIRT-MIG': {
    id: 'VIRT-MIG',
    product: PRODUCT.virt,
    version: '4.22',
    title: 'Live migration',
    sections: '§11.1–11.2',
    scope: '移行要件、帯域、同時移行設定',
    url: `${DOCS}/openshift_container_platform/4.22/html/virtualization/live-migration`,
  },
  'MON-STORAGE': {
    id: 'MON-STORAGE',
    product: 'Monitoring stack for Red Hat OpenShift 4.22',
    version: '4.22',
    title: 'Storing and recording data for core platform monitoring',
    sections: '§3.1–3.2',
    scope: 'プラットフォーム監視の永続ストレージと保持期間',
    url: `${DOCS}/monitoring_stack_for_red_hat_openshift/4.22/html/configuring_core_platform_monitoring/storing-and-recording-data`,
  },
};

/** 公式値の種類 */
export type OfficialKind = 'official_min' | 'official_rec' | 'official_default';

export interface OfficialValue {
  id: string;
  sourceId: SourceId;
  /** 章節または表番号 */
  section: string;
  label: string;
  value: number;
  unit: string;
  kind: OfficialKind;
  /** 適用条件 */
  condition: string;
}

function ov(v: OfficialValue): OfficialValue {
  return v;
}

/** 個別の公式値 */
export const OFFICIAL = {
  // --- OCP-INSTALL：インストール最低要件（1 台あたり） ---
  installCpCount: ov({
    id: 'installCpCount', sourceId: 'OCP-INSTALL', section: '§1.3.1 表 1.1',
    label: 'コントロールプレーンの台数', value: 3, unit: '台', kind: 'official_min',
    condition: 'クラスタ作成時の最小構成。ユーザープロビジョニングでは必要なマシンをすべて用意する',
  }),
  installComputeCount: ov({
    id: 'installComputeCount', sourceId: 'OCP-INSTALL', section: '§1.3.1 表 1.1',
    label: 'コンピュートの最少台数', value: 2, unit: '台', kind: 'official_min',
    condition: '少なくとも 2 台のコンピュートマシン',
  }),
  installBootstrapCount: ov({
    id: 'installBootstrapCount', sourceId: 'OCP-INSTALL', section: '§1.3.1 表 1.1',
    label: 'ブートストラップの台数', value: 1, unit: '台', kind: 'official_min',
    condition: 'インストール時のみ使用する一時マシン。インストール後に削除できる',
  }),
  installCpCpu: ov({ id: 'installCpCpu', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コントロールプレーンの vCPU', value: 4, unit: 'vCPU', kind: 'official_min', condition: '各ノード 1 台あたり。RHCOS' }),
  installCpRam: ov({ id: 'installCpRam', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コントロールプレーンのメモリ', value: 16, unit: 'GB', kind: 'official_min', condition: '各ノード 1 台あたり' }),
  installCpDisk: ov({ id: 'installCpDisk', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コントロールプレーンのストレージ', value: 100, unit: 'GB', kind: 'official_min', condition: '各ノード 1 台あたり' }),
  installCpIops: ov({ id: 'installCpIops', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コントロールプレーンの IOPS', value: 300, unit: 'IOPS', kind: 'official_min', condition: '各ノード 1 台あたり' }),
  installComputeCpu: ov({ id: 'installComputeCpu', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コンピュートの vCPU', value: 2, unit: 'vCPU', kind: 'official_min', condition: '各ノード 1 台あたり。RHCOS' }),
  installComputeRam: ov({ id: 'installComputeRam', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コンピュートのメモリ', value: 8, unit: 'GB', kind: 'official_min', condition: '各ノード 1 台あたり' }),
  installComputeDisk: ov({ id: 'installComputeDisk', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コンピュートのストレージ', value: 100, unit: 'GB', kind: 'official_min', condition: '各ノード 1 台あたり' }),
  installComputeIops: ov({ id: 'installComputeIops', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'コンピュートの IOPS', value: 300, unit: 'IOPS', kind: 'official_min', condition: '各ノード 1 台あたり' }),
  installBootstrapCpu: ov({ id: 'installBootstrapCpu', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'ブートストラップの vCPU', value: 4, unit: 'vCPU', kind: 'official_min', condition: 'インストール時の一時リソース' }),
  installBootstrapRam: ov({ id: 'installBootstrapRam', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'ブートストラップのメモリ', value: 16, unit: 'GB', kind: 'official_min', condition: 'インストール時の一時リソース' }),
  installBootstrapDisk: ov({ id: 'installBootstrapDisk', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'ブートストラップのストレージ', value: 100, unit: 'GB', kind: 'official_min', condition: 'インストール時の一時リソース' }),
  installBootstrapIops: ov({ id: 'installBootstrapIops', sourceId: 'OCP-INSTALL', section: '§1.3.2 表 1.2', label: 'ブートストラップの IOPS', value: 300, unit: 'IOPS', kind: 'official_min', condition: 'インストール時の一時リソース' }),

  // --- OCP-SCALE ---
  cpUtilGuideline: ov({
    id: 'cpUtilGuideline', sourceId: 'OCP-SCALE', section: '§2.1.2',
    label: 'コントロールプレーンの平常時 CPU・メモリ使用率の上限', value: 60, unit: '%', kind: 'official_rec',
    condition: '3 台のコントロールプレーンを持つ大規模・高密度クラスタで、1 台の停止時の負荷急増に備える運用指針',
  }),
  infraRecommendedCount: ov({
    id: 'infraRecommendedCount', sourceId: 'OCP-SCALE', section: '§2.3.1',
    label: 'インフラノードの推奨台数', value: 3, unit: '台', kind: 'official_rec',
    condition: '一般的な推奨（クラスタあたり 3 台）',
  }),

  // --- OCP-ETCD ---
  etcdFsyncP99: ov({
    id: 'etcdFsyncP99', sourceId: 'OCP-ETCD', section: '§2.1、§2.3',
    label: 'etcd ディスクの p99 fsync', value: 10, unit: 'ms 未満', kind: 'official_rec',
    condition: 'etcd を置くディスクの WAL fsync の 99 パーセンタイル',
  }),
  etcdRttP99: ov({
    id: 'etcdRttP99', sourceId: 'OCP-ETCD', section: '§2.2',
    label: 'etcd メンバー間の p99 RTT', value: 50, unit: 'ms 未満', kind: 'official_rec',
    condition: 'etcd_network_peer_round_trip_time_seconds の 99 パーセンタイル',
  }),
  etcdSeqWriteIops: ov({
    id: 'etcdSeqWriteIops', sourceId: 'OCP-ETCD', section: '§2.1',
    label: 'etcd の 8 KB シーケンシャル同期書き込み（fdatasync 込み）', value: 50, unit: 'IOPS 以上を 10 ms 未満', kind: 'official_min',
    condition: 'etcd を置くブロックデバイス。高負荷クラスタでは 8000 bytes・500 IOPS（2 ms）を推奨',
  }),
  etcdSeqWriteIopsHeavy: ov({
    id: 'etcdSeqWriteIopsHeavy', sourceId: 'OCP-ETCD', section: '§2.1',
    label: '高負荷クラスタでの etcd シーケンシャル書き込み', value: 500, unit: 'IOPS（8000 bytes、2 ms）', kind: 'official_rec',
    condition: '高負荷クラスタ向けの推奨',
  }),

  // --- OCP-NODES ---
  sysReservedCpuFloor: ov({
    id: 'sysReservedCpuFloor', sourceId: 'OCP-NODES', section: '§6.12.1',
    label: 'システム予約 CPU の自動計算の下限', value: 0.5, unit: 'コア', kind: 'official_default',
    condition: '1 コア目 0.06 コア、以降 1 コアごとに 0.012 コアを加算し、0.5 コア未満なら 0.5 コア',
  }),
  maxPodsDefault: ov({
    id: 'maxPodsDefault', sourceId: 'OCP-NODES', section: '§6.5.1',
    label: 'maxPods の既定値', value: 250, unit: 'Pod／ノード', kind: 'official_default',
    condition: 'KubeletConfig の maxPods。podsPerCore と併用時は小さい方が上限',
  }),

  // --- VIRT-INSTALL ---
  virtMemPerInfraNode: ov({
    id: 'virtMemPerInfraNode', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'Virtualization のメモリ追加負荷（インフラノード 1 台あたり）', value: 150, unit: 'MiB', kind: 'official_default',
    condition: '概算値（≈）',
  }),
  virtMemPerWorker: ov({
    id: 'virtMemPerWorker', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'Virtualization のメモリ追加負荷（Worker 1 台あたり）', value: 360, unit: 'MiB', kind: 'official_default',
    condition: '概算値（≈）',
  }),
  virtMemInfraTotal: ov({
    id: 'virtMemInfraTotal', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'Virtualization 環境リソースのメモリ（インフラノード群全体）', value: 2179, unit: 'MiB', kind: 'official_default',
    condition: 'すべてのインフラノードに分散する合計値。ノード数を掛けない',
  }),
  virtCpuInfraTotal: ov({
    id: 'virtCpuInfraTotal', sourceId: 'VIRT-INSTALL', section: '§4.2.4.2',
    label: 'Virtualization の CPU 追加負荷（インフラコンポーネントをホストするノード群全体）', value: 4, unit: 'コア', kind: 'official_default',
    condition: 'ロギング・ルーティング・監視の増加分。ノード群全体に分散する合計 4 コア（4000 ミリコア）',
  }),
  virtCpuPerWorker: ov({
    id: 'virtCpuPerWorker', sourceId: 'VIRT-INSTALL', section: '§4.2.4.2',
    label: 'Virtualization の CPU 追加負荷（VM をホストする Worker 1 台あたり）', value: 2, unit: 'コア', kind: 'official_default',
    condition: '管理ワークロード用。VM の CPU に加えて必要（≈ 2 コア + VM ごとの CPU 追加負荷）',
  }),
  vmMemOverheadFactor: ov({
    id: 'vmMemOverheadFactor', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：要求メモリに掛ける係数', value: 0.002, unit: '×要求メモリ', kind: 'official_default', condition: 'VM 1 台あたりの概算式の項',
  }),
  vmMemOverheadBase: ov({
    id: 'vmMemOverheadBase', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：virt-launcher Pod のプロセス', value: 218, unit: 'MiB', kind: 'official_default', condition: 'VM 1 台あたりの概算式の項',
  }),
  vmMemOverheadPerVcpu: ov({
    id: 'vmMemOverheadPerVcpu', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：vCPU 1 個あたり', value: 8, unit: 'MiB', kind: 'official_default', condition: 'VM 1 台あたりの概算式の項',
  }),
  vmMemOverheadPerGraphics: ov({
    id: 'vmMemOverheadPerGraphics', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：グラフィックスデバイス 1 個あたり', value: 16, unit: 'MiB', kind: 'official_default', condition: 'VM 1 台あたりの概算式の項',
  }),
  vmMemOverheadPerDevice: ov({
    id: 'vmMemOverheadPerDevice', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：SR-IOV ネットワークデバイスまたは GPU 1 個あたり', value: 1024, unit: 'MiB', kind: 'official_default', condition: '該当デバイスがある場合（1 GiB／デバイス）',
  }),
  vmMemOverheadSev: ov({
    id: 'vmMemOverheadSev', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：SEV 有効時', value: 256, unit: 'MiB', kind: 'official_default', condition: 'Secure Encrypted Virtualization が有効な場合',
  }),
  vmMemOverheadTpm: ov({
    id: 'vmMemOverheadTpm', sourceId: 'VIRT-INSTALL', section: '§4.2.4.1',
    label: 'VM メモリ追加負荷：TPM 有効時', value: 53, unit: 'MiB', kind: 'official_default', condition: 'Trusted Platform Module が有効な場合',
  }),
  virtStoragePerNode: ov({
    id: 'virtStoragePerNode', sourceId: 'VIRT-INSTALL', section: '§4.2.4.3',
    label: 'Virtualization 導入によるディスク消費（ノード 1 台あたり）', value: 10, unit: 'GiB', kind: 'official_default',
    condition: 'クラスタ内の各ノードに対する概算値（≈）',
  }),
  migrationParallelCluster: ov({
    id: 'migrationParallelCluster', sourceId: 'VIRT-MIG', section: '§11.2.1',
    label: '同時ライブマイグレーション数（クラスタ全体）の既定値', value: 5, unit: '件', kind: 'official_default',
    condition: 'HyperConverged CR の parallelMigrationsPerCluster',
  }),
  migrationParallelPerNode: ov({
    id: 'migrationParallelPerNode', sourceId: 'VIRT-MIG', section: '§11.2.1',
    label: '送信元ノードごとの同時移行数の既定値', value: 2, unit: '件', kind: 'official_default',
    condition: 'HyperConverged CR の parallelOutboundMigrationsPerNode',
  }),
  migrationBandwidthDefault: ov({
    id: 'migrationBandwidthDefault', sourceId: 'VIRT-MIG', section: '§11.2.1',
    label: 'bandwidthPerMigration の既定値', value: 0, unit: '（0 = 帯域上限なし）', kind: 'official_default',
    condition: '移行 1 件あたりの帯域（bytes/s）。0 は無制限',
  }),

  // --- VIRT-LIMITS（試験上限） ---
  limitVmVcpu: ov({ id: 'limitVmVcpu', sourceId: 'VIRT-LIMITS', section: '§1.2.1.1', label: 'VM あたりの vCPU（試験上限）', value: 255, unit: 'vCPU', kind: 'official_rec', condition: 'VM 1 台あたりの試験済み上限' }),
  limitVmMemory: ov({ id: 'limitVmMemory', sourceId: 'VIRT-LIMITS', section: '§1.2.1.1', label: 'VM あたりのメモリ（試験上限）', value: 6, unit: 'TB', kind: 'official_rec', condition: 'VM 1 台あたりの試験済み上限' }),
  limitVmMinMemory: ov({ id: 'limitVmMinMemory', sourceId: 'VIRT-LIMITS', section: '§1.2.1.1', label: 'VM あたりの最小メモリ', value: 512, unit: 'MB', kind: 'official_min', condition: '各 VM に必要な最小メモリ' }),
  limitHosts: ov({ id: 'limitHosts', sourceId: 'VIRT-LIMITS', section: '§1.2.1.3', label: 'クラスタのホスト数（試験上限）', value: 500, unit: '台', kind: 'official_rec', condition: '100 台以下を推奨' }),
  limitHostsRecommended: ov({ id: 'limitHostsRecommended', sourceId: 'VIRT-LIMITS', section: '§1.2.1.3', label: 'クラスタのホスト数（推奨）', value: 100, unit: '台以下', kind: 'official_rec', condition: '100 台を超える場合は RHACM による複数クラスタ運用を検討' }),
  limitDefinedVms: ov({ id: 'limitDefinedVms', sourceId: 'VIRT-LIMITS', section: '§1.2.1.3', label: '定義済み VM 数（試験上限）', value: 10000, unit: '台', kind: 'official_rec', condition: 'クラスタあたりの試験済み上限' }),
  limitKvmDevices: ov({ id: 'limitKvmDevices', sourceId: 'VIRT-LIMITS', section: '§1.2.1.3', label: 'ノードあたりの KVM デバイス数の既定値', value: 1000, unit: '個（devices.kubevirt.io/kvm: 1k）', kind: 'official_default', condition: 'ノードに配置できる VM 数の上限要因' }),

  // --- MON-STORAGE ---
  promRetentionDefault: ov({
    id: 'promRetentionDefault', sourceId: 'MON-STORAGE', section: '§3.2',
    label: 'プラットフォーム監視 Prometheus の既定保持期間', value: 15, unit: '日', kind: 'official_default',
    condition: 'コアプラットフォーム監視',
  }),
} as const;

export type OfficialId = keyof typeof OFFICIAL;

/** 試験結果の表（行ごとに出典を持つ） */
export interface ScaleRow {
  id: string;
  sourceId: SourceId;
  section: string;
  nodes: number;
  namespaces: number;
  cpuCores: number;
  memoryGB: number;
  /** 自動参照に使うか */
  autoSelectable: boolean;
  condition: string;
}

export const CP_SCALE_ROWS: ScaleRow[] = [
  { id: 'cpScale24', sourceId: 'OCP-SCALE', section: '§2.1.2', nodes: 24, namespaces: 500, cpuCores: 4, memoryGB: 16, autoSelectable: true, condition: 'AWS 上の cluster-density 試験（制御プレーン r5.4xlarge、コンピュート m5.2xlarge）' },
  { id: 'cpScale120', sourceId: 'OCP-SCALE', section: '§2.1.2', nodes: 120, namespaces: 1000, cpuCores: 8, memoryGB: 32, autoSelectable: true, condition: 'AWS 上の cluster-density 試験' },
  { id: 'cpScale252Ovn', sourceId: 'OCP-SCALE', section: '§2.1.2', nodes: 252, namespaces: 4000, cpuCores: 24, memoryGB: 128, autoSelectable: true, condition: 'AWS 上の cluster-density 試験。OVN-Kubernetes 使用時の値（それ以外は 16 コア・64 GB）' },
  { id: 'cpScale501', sourceId: 'OCP-SCALE', section: '§2.1.2', nodes: 501, namespaces: 4000, cpuCores: 16, memoryGB: 96, autoSelectable: false, condition: 'OVN-Kubernetes では未検証のため、自動参照点に含めない' },
];

export const INFRA_SCALE_ROWS: ScaleRow[] = [
  { id: 'infraScale27', sourceId: 'OCP-SCALE', section: '§2.3.1', nodes: 27, namespaces: 500, cpuCores: 4, memoryGB: 24, autoSelectable: true, condition: '監視スタックとデフォルト Ingress Controller をインフラノードへ移した cluster-density 試験' },
  { id: 'infraScale120', sourceId: 'OCP-SCALE', section: '§2.3.1', nodes: 120, namespaces: 1000, cpuCores: 8, memoryGB: 48, autoSelectable: true, condition: '同上' },
  { id: 'infraScale252', sourceId: 'OCP-SCALE', section: '§2.3.1', nodes: 252, namespaces: 4000, cpuCores: 16, memoryGB: 128, autoSelectable: true, condition: '同上' },
  { id: 'infraScale501', sourceId: 'OCP-SCALE', section: '§2.3.1', nodes: 501, namespaces: 4000, cpuCores: 32, memoryGB: 128, autoSelectable: true, condition: '同上' },
];

/** 確認先の案内（数値ではない公式情報） */
export const OFFICIAL_NOTES = {
  platforms: { sourceId: 'VIRT-INSTALL' as SourceId, section: '§4.1.1–4.1.5、§4.2.1', text: '対応プラットフォーム（オンプレミスのベアメタル、ARM64 ベアメタル、IBM Z／LinuxONE の LPAR、クラウドのベアメタル等）と、CPU の要件（RHEL 9 がサポートする CPU、アーキテクチャごとの仮想化拡張の有効化）は公式資料で確認してください。このアプリは個別プラットフォームのサポート可否を判定しません。' },
  rhcos: { sourceId: 'VIRT-INSTALL' as SourceId, section: '§4.2.2', text: 'VM を稼働させる Worker ノードには RHCOS が必要です（RHEL Worker は非対応）。' },
  storage: { sourceId: 'VIRT-INSTALL' as SourceId, section: '§4.2.3', text: 'OpenShift Container Platform がサポートするストレージと、Virtualization 用または OCP の既定ストレージクラスが必要です。' },
  migration: { sourceId: 'VIRT-INSTALL' as SourceId, section: '§4.2.7', text: 'ライブマイグレーションには RWX の共有ストレージ、十分なメモリとネットワーク帯域、互換性のある CPU が必要です。専用 Multus ネットワークを強く推奨します。' },
  migrationReserve: { sourceId: 'VIRT-INSTALL' as SourceId, section: '§4.2.7', text: 'drain に伴う移行用の予備メモリ ≈ 同時に drain できる最大ノード数 × ノードごとの VM メモリ要求量合計の最大値' },
  cpuAllocationRatio: { sourceId: 'VIRT-VM' as SourceId, section: '§8.18.14.2', text: '共有 CPU の Pod CPU 要求量 = vCPU 数 × (1 ÷ vmiCPUAllocationRatio)。専用 CPU はオーバーコミットできません。' },
  infraScope: { sourceId: 'OCP-SCALE' as SourceId, section: '§2.3.1', text: 'インフラの試験値は、クラスタ作成時に導入される Monitoring・Ingress・Registry をホストするインフラノードにのみ適用されます。4.22 では 0.5 コアがシステム予約される前提です。' },
  cpScope: { sourceId: 'OCP-SCALE' as SourceId, section: '§2.1.2', text: '必要量はノード数・オブジェクト数・オブジェクトの作成頻度、OLM が管理する Namespace と Operator の数で変わります。' },
} as const;

export interface ResolvedRef {
  key: string;
  sourceId: SourceId;
  section: string;
  url: string;
  title: string;
}

/** OFFICIAL・試験表・案内・資料 ID のいずれかを出典情報に解決する */
export function resolveRef(key: string): ResolvedRef | undefined {
  const o = (OFFICIAL as Record<string, OfficialValue>)[key];
  if (o) return { key, sourceId: o.sourceId, section: o.section, url: SOURCES[o.sourceId].url, title: SOURCES[o.sourceId].title };
  const row = [...CP_SCALE_ROWS, ...INFRA_SCALE_ROWS].find((r) => r.id === key);
  if (row) return { key, sourceId: row.sourceId, section: row.section, url: SOURCES[row.sourceId].url, title: SOURCES[row.sourceId].title };
  const note = (OFFICIAL_NOTES as Record<string, { sourceId: SourceId; section: string }>)[key];
  if (note) return { key, sourceId: note.sourceId, section: note.section, url: SOURCES[note.sourceId].url, title: SOURCES[note.sourceId].title };
  if (key in SOURCES) {
    const s = SOURCES[key as SourceId];
    return { key, sourceId: s.id, section: s.sections, url: s.url, title: s.title };
  }
  return undefined;
}

/** 参照キーが登録済みかどうか（テスト用） */
export function isKnownRef(key: string): boolean {
  return resolveRef(key) !== undefined;
}
