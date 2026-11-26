import type { PatternId } from './types';
import { OCP_VERSION, docsBase } from './version';

export interface PatternInfo {
  id: PatternId;
  /** 見出し用の短い名前 */
  shortName: string;
  name: string;
  /** §6.1 の一言結論 */
  conclusion: string;
  /** ゲスト IP が宛先になるか（図とバッジで使う） */
  guestIpReachable: boolean;
  /** §6.4: 説明文に必ず含めること */
  points: string[];
  merits: string[];
  demerits: string[];
  /** 移行チェックリスト（重要な順。最終的に全体で最大 7 件に絞る） */
  checklist: string[];
  /** 代替案として出すとき「どう条件が変わればこちらになるか」1 行 */
  whenToChoose: string;
  /** §4.4 の対応表のうち、このパターンに関係する行の key */
  mappingKeys: string[];
}

export const patterns: Record<PatternId, PatternInfo> = {
  A: {
    id: 'A',
    shortName: 'Pod Network + Service',
    name: 'Pod Network + masquerade + Service',
    conclusion: 'ゲスト IP を捨てて Kubernetes の流儀に寄せる、最もシンプルな構成',
    guestIpReachable: false,
    points: [
      'ゲスト OS は 10.0.2.2 のような内部アドレスを持ちます。このアドレスは全 VM 共通なので、宛先にはなりません。',
      'アクセス経路は「クライアント → Service (ClusterIP) → Pod IP → NAT → ゲスト」です。',
      'Pod IP はライブマイグレーションで変わります。既存の接続は中断され、新しい接続は Service 経由で復旧します。',
      '外部公開は、HTTP なら Route、それ以外（SSH、DB、独自 TCP/UDP）は LoadBalancer / NodePort を使います。',
    ],
    merits: [
      'ノード側の追加配線（NNCP）が不要で、最もシンプル',
      'NetworkPolicy がそのまま効く',
      'ネットワーク担当との VLAN 調整が要らない',
    ],
    demerits: [
      'ゲスト IP を直接指定する接続は使えない（向先の変更が必要）',
      'ライブマイグレーションで既存接続が切れる',
      '送信元 IP 認証や L2 依存のアプリには向かない',
    ],
    checklist: [
      'クライアント側の向先を Service / Route / LB に変更する調整が済んでいる',
      '非 HTTP サービスの公開方法（LoadBalancer / NodePort）を決めた',
      'ライブマイグレーションで既存接続が切れることを、利用者と監視の担当に伝えた',
      '接続先側の FW 許可が、移行元のゲスト IP 前提になっていないか確認した',
    ],
    whenToChoose: 'クライアントの向先を Service / LB に変えられ、IP 不変も L2 依存もないならこちら',
    mappingKeys: ['vds-def', 'esxi-vds', 'nsx-dfw'],
  },
  B: {
    id: 'B',
    shortName: 'Primary UDN Layer2',
    name: 'Primary UDN Layer2 + Persistent IPAM + bridge',
    conclusion: 'ゲスト IP を本物の宛先として維持する。ただし戦場はクラスタ内オーバーレイ',
    guestIpReachable: true,
    points: [
      'NAT を挟まないので、ゲスト IP がクラスタ内で通用する本物の宛先になります。Persistent IPAM により、ライブマイグレーションしても IP は変わりません。',
      'Primary なので、その namespace のデフォルトネットワークが Pod Network からこの UDN に置き換わります。namespace は専用ラベル付きで新規作成する必要があり、既存の namespace には後から付けられません。',
      '物理ネットワークの変更は不要です（Geneve のオーバーレイ）。その代わり、既定ではクラスタ外から直接は届きません。外部公開が要るなら別途 Service 等の設計が必要です。',
      '応用: ベアメタルなら、CUDN と BGP の経路広報（RouteAdvertisements）を組み合わせて、VM の経路を外部ネットワークへ広報できます。この場合はクラスタ外からもゲスト IP へ届きます（namespace スコープの UDN は対象外）。',
      'IP をクラスタの IPAM に任せるなら払い出しは自動です。ゲスト OS 側で静的設定も併用する場合は、払い出し範囲と重ならないよう管理元を 1 つに決めてください。',
    ],
    merits: [
      'ゲスト IP がそのまま宛先になり、ライブマイグレーションでも変わらない',
      '物理スイッチや VLAN の変更が不要',
      'OVN の管理下なので NetworkPolicy の土台がある',
    ],
    demerits: [
      '既定ではクラスタ外からゲスト IP へ直接は届かない（ベアメタルで BGP の経路広報を使う場合を除く）',
      'オーバーレイ分の MTU を考慮する必要がある',
      '接続相手も同じネットワークに参加している必要がある',
    ],
    checklist: [
      '接続相手の VM がすべて同じ UDN / CUDN に参加する設計になっている',
      'クラスタ外からアクセスが必要な場合の公開方法（Service 等）を決めた',
      'MTU（オーバーレイのヘッダ分。物理側のジャンボフレーム要否）を確認した',
      'IP の管理元（クラスタ IPAM か、ゲスト静的設定か）を 1 つに決め、二重管理になっていない',
      'namespace を Primary UDN 用のラベル付きで新規作成する手順にした（既存 namespace には後付けできない）',
    ],
    whenToChoose: '接続相手も全部クラスタ内へ移り、新規サブネットでよいならこちら。ベアメタルで BGP の経路広報を使えるなら、クラスタ外の相手にも届かせられます',
    mappingKeys: ['vds-def', 'esxi-vds', 'vss-pg', 'vds-pg', 'nsx-segment'],
  },
  C: {
    id: 'C',
    shortName: 'Localnet',
    name: 'Localnet（NNCP bridge-mapping + CUDN/NAD）',
    conclusion: '物理 VLAN へ OVN 管理下のまま出る。vSphere からの「ほぼそのまま移行」の本命',
    guestIpReachable: true,
    points: [
      'NNCP の ovn.bridge-mappings で、論理名（例: vlan100）を br-ex または専用 OVS ブリッジへ対応付ける配線が前提です。全ノードに同名・同構成が必須で、欠けたノードへ移行するとネットワークが消えます。',
      'VLAN / DHCP / ゲートウェイは物理側の現行のままです。IPAM は原則 Disabled にして、物理 DHCP / ゲスト静的設定を正とします（二重管理しない）。',
      'OVN の管理下に留まるため、ポートセキュリティや将来のポリシー適用の土台があります。',
      'Pod Network の NIC を管理用に残す場合は、ゲスト側のデフォルトゲートウェイの競合に注意してください。',
      '応用: 業務系の NIC だけにする場合は、Localnet を Primary 相当で使う設計もあり得ます。このアプリでは Secondary の形を基本にしています。',
    ],
    merits: [
      '現行の VLAN・サブネット・ゲートウェイをそのまま使える',
      'OVN の管理下なのでポートセキュリティやポリシーの土台がある',
      'VLAN はネットワーク定義側の属性なので、追加が Kubernetes の宣言で済む',
    ],
    demerits: [
      '全ノードに同名・同構成の bridge-mapping を用意する必要がある',
      '物理スイッチ側のトランク設定（VLAN 許可）が要る',
      'br-ex を流用すると管理系とデータ系が同じ NIC に乗る',
    ],
    checklist: [
      'bridge-mapping（論理名）が全ノードに同名・同構成で存在する',
      '物理スイッチ側のトランク設定（VLAN 許可）を確認した',
      'DHCP / 静的 IP の管理台帳が二重化していない（クラスタ側の IPAM は Disabled）',
      'ゲスト OS のデフォルトゲートウェイが業務系 NIC を向いている（Pod Network の NIC と競合しない）',
      'VM データ用に専用 bond + 専用ブリッジを分けるか検討した（br-ex 流用の是非）',
      'MTU が物理側の設定と揃っている',
    ],
    whenToChoose: 'クラスタ側で通信制御をしたい、または OVN の管理下に留めたいならこちら',
    mappingKeys: ['vds-def', 'esxi-vds', 'vss-pg', 'vds-pg', 'uplink', 'vlan', 'nsx-segment'],
  },
  D: {
    id: 'D',
    shortName: 'Linux Bridge',
    name: 'Linux Bridge（NNCP + bridge NAD）',
    conclusion: '物理 VLAN へ OVN をバイパスして出る。シンプルだがポリシーと可観測性は自前',
    guestIpReachable: true,
    points: [
      'NNCP で VLAN サブインターフェース（例: bond0.100）と Linux Bridge（例: br-vlan100）を各ノードに作り、NAD（type: bridge）で VM を接続します。',
      'トラフィックは br-int（OVN）を完全にバイパスします。',
      'NetworkPolicy は効きません。IP の台帳もクラスタ側に残りません。可観測性や障害対応はノード OS 側（nmstatectl show、bridge fdb 等）が中心です。',
      'VLAN を足すことは、ノード配線を足すことを意味します。運用コストとして見込んでください。',
      'メリットは素直さと、OVN の挙動に引きずられないことです。それ以外の点では Localnet（C）がほぼ上位互換です。',
    ],
    merits: [
      '構造が素直で、従来の Linux ブリッジ運用の知見がそのまま使える',
      'OVN の挙動に引きずられない',
    ],
    demerits: [
      'NetworkPolicy が効かない（通信制御は物理 FW 頼み）',
      'IP の台帳がクラスタ側に残らない',
      'VLAN の追加がノード配線の追加になる',
    ],
    checklist: [
      'VLAN サブインターフェースと Linux Bridge が全ノードに同名・同構成で存在する',
      '物理スイッチ側のトランク設定（VLAN 許可）を確認した',
      'IP の管理元（物理 DHCP / ゲスト静的設定）を決めた（クラスタ側に台帳は残らない）',
      'ゲスト OS のデフォルトゲートウェイが業務系 NIC を向いている',
      '通信制御を物理 FW で行う設計になっている（NetworkPolicy は効かない）',
      '障害時のノード OS 側の確認手順（nmstatectl show、bridge fdb）を運用手順に入れた',
    ],
    whenToChoose: '通信制御は物理 FW 任せで、既存の Linux ブリッジ運用の知見をそのまま使いたいならこちら',
    mappingKeys: ['vss-pg', 'vds-pg', 'uplink', 'vlan'],
  },
  E: {
    id: 'E',
    shortName: 'マルチホーム',
    name: 'マルチホーム（Primary + Secondary 併用）',
    conclusion: 'NIC が複数の VM 向け。主となる構成に、追加 NIC 分の Secondary ネットワークを足す',
    guestIpReachable: true,
    points: [
      '主となるネットワーク（Primary）と、追加セグメント（Secondary）で役割を分けます。',
      'ゲスト OS 側で、どちらの NIC をデフォルトゲートウェイにするかの設計が必要です。',
      '追加 NIC 分の CUDN は、主となる構成とは別ファイルとして生成します。',
    ],
    merits: ['業務系 / 管理系などの分離を、移行後もそのまま保てる'],
    demerits: ['ゲスト OS 側のルーティング設計が必要になる'],
    checklist: [
      'ゲスト OS 側で、どちらの NIC をデフォルトゲートウェイにするか決めた',
      '追加セグメント分の bridge-mapping を NNCP に追加した',
    ],
    whenToChoose: 'VM が複数のポートグループに繋がっている場合に付け足す',
    mappingKeys: ['vds-pg'],
  },
  F: {
    id: 'F',
    shortName: 'SR-IOV',
    name: 'SR-IOV（例外枠）',
    conclusion: 'デバイス直結の高性能枠。主診断にはせず、検討メモとして添える',
    guestIpReachable: true,
    points: [
      'VF（物理 NIC の仮想機能）をゲストへ直接渡すため、物理 L2 に直結して高性能です。',
      'ライブマイグレーションに制約が出るなど、汎用的な解ではありません。',
      'まずは C / B で性能が足りないかを検討してから選んでください。YAML は参考レベルの NAD のみです。',
    ],
    merits: ['スループット / レイテンシが最も有利'],
    demerits: ['ライブマイグレーションに制約が出る', 'SR-IOV 対応 NIC と SR-IOV Network Operator の設定が要る'],
    checklist: [],
    whenToChoose: 'C / B で性能要件を満たせないと確認できた場合だけ',
    mappingKeys: [],
  },
};

/** 結果画面末尾の公式ドキュメントリンク（最大 3 件） */
export const docLinks: { label: string; url: string }[] = [
  {
    label: `OpenShift Virtualization ${OCP_VERSION} — Networking`,
    url: `${docsBase}/virtualization/networking`,
  },
  {
    label: `OpenShift Container Platform ${OCP_VERSION} — Multiple networks（UDN / Localnet）`,
    url: `${docsBase}/multiple_networks/index`,
  },
  {
    label: `OpenShift Container Platform ${OCP_VERSION} — Kubernetes NMState（NNCP）`,
    url: `${docsBase}/kubernetes_nmstate/index`,
  },
];

// ---------------------------------------------------------------------------
// パターン一覧ページ用: 向いている VM と、利点・考慮事項の比較表
// ---------------------------------------------------------------------------

/** 一覧カードに出す「こんな VM 向け」1 行 */
export const fitsFor: Record<PatternId, string> = {
  A: 'Web / API など名前や LB で繋がるサービス、VM から外へ繋ぎに行くのが主の VM',
  B: 'システム一式をまとめて移し、VM 同士が IP を直接指定して通信する構成',
  C: 'クラスタ外に相手が残る基幹系など、現行の VLAN・IP のまま移したい VM',
  D: '通信制御は物理 FW で完結し、Linux ブリッジの運用に慣れたチームが見る VM',
  E: 'ポートグループが複数（業務系 + 管理系など）の VM。A〜D に追加 NIC を足す',
  F: '非常に高い性能要件があり、C / B では足りないと確認できた VM（検討メモ）',
};

export type Rating = 'good' | 'ok' | 'caution' | 'ng';

export interface CompareCell {
  rating?: Rating;
  text: string;
}

export interface CompareRow {
  label: string;
  /** 行の補足（何を比べているか） */
  hint?: string;
  cells: Record<'A' | 'B' | 'C' | 'D', CompareCell>;
}

/** 記号と色の両方で示す（色覚多様性への配慮） */
export const ratingMark: Record<Rating, { mark: string; label: string }> = {
  good: { mark: '◎', label: '得意' },
  ok: { mark: '○', label: '対応できる' },
  caution: { mark: '△', label: '条件付き・手間あり' },
  ng: { mark: '✕', label: '不向き' },
};

export const compareRows: CompareRow[] = [
  {
    label: 'ゲスト IP が宛先になるか',
    cells: {
      A: { rating: 'ng', text: 'ならない（10.0.2.2 は全 VM 共通、NAT 経由）' },
      B: { rating: 'good', text: 'なる（クラスタ内で通用する IP）' },
      C: { rating: 'good', text: 'なる（物理 VLAN 上の現行 IP）' },
      D: { rating: 'good', text: 'なる（物理 VLAN 上の現行 IP）' },
    },
  },
  {
    label: 'クラスタ外の相手から届くか',
    cells: {
      A: { rating: 'ok', text: 'Service 経由（Route / LoadBalancer / NodePort）' },
      B: { rating: 'caution', text: '既定では届かない。ベアメタル + CUDN + BGP の経路広報なら届く' },
      C: { rating: 'good', text: '現行 VLAN からそのまま届く' },
      D: { rating: 'good', text: '現行 VLAN からそのまま届く' },
    },
  },
  {
    label: 'ライブマイグレーション時',
    cells: {
      A: { rating: 'caution', text: 'Pod IP が変わり、既存の接続は切れる（Service で復旧）' },
      B: { rating: 'good', text: 'IP は変わらない（Persistent IPAM）' },
      C: { rating: 'ok', text: 'IP は変わらない。移行先ノードにも同じ配線が必要' },
      D: { rating: 'ok', text: 'IP は変わらない。移行先ノードにも同じ配線が必要' },
    },
  },
  {
    label: '物理ネットワーク・ノードの配線',
    cells: {
      A: { rating: 'good', text: '変更不要' },
      B: { rating: 'good', text: '変更不要（MTU の確認のみ）' },
      C: { rating: 'caution', text: 'NNCP で bridge-mapping、スイッチのトランク設定' },
      D: { rating: 'caution', text: 'NNCP で VLAN IF とブリッジ、トランク設定。VLAN を足すたびに配線追加' },
    },
  },
  {
    label: 'クラスタ側の通信制御',
    hint: 'NSX の分散 FW に相当するもの',
    cells: {
      A: { rating: 'good', text: 'NetworkPolicy がそのまま効く' },
      B: { rating: 'ok', text: 'OVN の管理下で、ポリシーの土台がある' },
      C: { rating: 'ok', text: 'OVN の管理下。ポートセキュリティとポリシーの土台がある' },
      D: { rating: 'ng', text: 'NetworkPolicy は効かない（物理 FW 頼み）' },
    },
  },
  {
    label: 'L2 依存のアプリ',
    hint: 'ブロードキャスト、IP の持ち回り、送信元 IP 認証など',
    cells: {
      A: { rating: 'ng', text: 'NAT を挟むので不向き' },
      B: { rating: 'ok', text: 'NAT のない L2 セグメントで維持できる' },
      C: { rating: 'ok', text: '物理 VLAN にそのまま参加して維持できる' },
      D: { rating: 'ok', text: '物理 VLAN にそのまま参加して維持できる' },
    },
  },
  {
    label: 'IP の管理元',
    cells: {
      A: { text: 'クラスタ（Pod IP）。ゲストは固定の内部アドレス' },
      B: { text: 'クラスタの IPAM（Persistent）' },
      C: { text: '物理 DHCP / ゲスト静的設定（IPAM は Disabled）' },
      D: { text: '物理 DHCP / ゲスト静的設定（クラスタ側に台帳なし）' },
    },
  },
  {
    label: '障害対応の場所',
    cells: {
      A: { text: 'Kubernetes / OVN 側（Service、Pod）' },
      B: { text: 'Kubernetes / OVN 側' },
      C: { text: 'Kubernetes / OVN 側 + ノードの配線（NNCP）' },
      D: { text: 'ノード OS 側（nmstatectl show、bridge fdb 等）' },
    },
  },
  {
    label: '作るもの（YAML）',
    cells: {
      A: { text: 'VM + Service（+ Route）' },
      B: { text: 'Namespace + UDN / CUDN + VM' },
      C: { text: 'NNCP + CUDN (Localnet) + VM' },
      D: { text: 'NNCP + NAD + VM' },
    },
  },
];
