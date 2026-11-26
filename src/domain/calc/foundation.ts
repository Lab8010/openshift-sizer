// OpenShift 基盤としての要件（etcd・コントロールプレーン・レジストリ・監視・ネットワークの前提）。
// VM の要求量とは別に、クラスタそのものを動かすために必要な条件をまとめる。
import { has, type SizingModel } from '../parse';
import { fmt, fmtBytes, type ResultItem, type Section, type Status } from '../result';
import { OFFICIAL, PROM_STORAGE_ROWS, type PromStorageRow } from '../sources';
import { GiB } from '../units';
import { b, off } from './helpers';

export interface FoundationCalc {
  sections: Section[];
  totalNodes: number | null;
  promRow: PromStorageRow | null;
  promStatus: Status;
  cpFailureTolerance: number | null;
  items: ResultItem[];
}

/** etcd の障害許容台数（OCP-ETCD-PERF §3.2 表 3.1） */
export function etcdFailureTolerance(cpCount: number): number | null {
  const table: Record<number, number> = { 1: 0, 3: 1, 4: 1, 5: 2 };
  return table[cpCount] ?? null;
}

/** 全ノード数が収まる最小の Prometheus 試験行（補間・外挿なし） */
export function selectPromRow(totalNodes: number): PromStorageRow | null {
  return PROM_STORAGE_ROWS.find((r) => r.nodes >= totalNodes) ?? null;
}

export function calcFoundation(model: SizingModel, computeCount: number | null): FoundationCalc {
  const P = 'foundation';
  const cp = model.roles.controlPlane;
  const cpCount = has(cp.count) ? cp.count.v : off('installCpCount');
  const tol = etcdFailureTolerance(cpCount);
  const m = model.cpMetrics;

  // ---- etcd とコントロールプレーン ----
  const etcdItems: ResultItem[] = [
    {
      id: `${P}.cpCount`,
      label: 'コントロールプレーンの台数と障害許容（etcd）',
      kind: 'official_default',
      status: cpCount === 3 ? 'ok' : cpCount === 4 || cpCount === 5 ? 'individual' : 'ng',
      text:
        tol !== null && cpCount >= 3
          ? `${fmt(cpCount)} 台：${tol} 台まで停止しても etcd の過半数を保てる${cpCount > 3 ? '（4〜5 台はベアメタルのみ。台数を増やすとスループット低下・レイテンシ増加の可能性）' : ''}`
          : `${fmt(cpCount)} 台：通常のマルチノード構成は 3 台（ベアメタルで最大 ${off('cpCountMaxBareMetal')} 台）`,
      refs: ['cpCountMaxBareMetal', 'etcdFailureTolerance'],
      note: '3 台構成で 2 台以上止まると etcd は過半数を失う',
    },
    {
      id: `${P}.etcdDisk`,
      label: 'etcd 用のディスク（種類と置き方）',
      kind: 'official_rec',
      status: 'unconfirmed',
      text: '専用ドライブ、SSD 以上（本番は NVMe を推奨）。iSCSI・NFS・NAS／SAN・Ceph RBD などネットワーク越しのストレージと回転ディスクは避ける。ログなど負荷の高いものを同じドライブに置かない',
      refs: ['etcdDisk', 'etcdMoveDisk'],
      note: 'I/O の多いワークロードをコントロールプレーンに同居させない。共有ディスクで始めた場合も、専用ディスクへ移せる',
      missing: ['etcd 用ディスクの構成（専用か、SSD／NVMe か）'],
    },
    {
      id: `${P}.etcdSize`,
      label: 'etcd 専用ディスクの容量',
      kind: 'official_default',
      status: 'info',
      value: off('etcdQuotaDefault') * GiB,
      unit: 'bytes',
      text: `より大きいこと（etcd のクォータ既定値。最大 ${off('etcdQuotaMax')} GiB まで増やす可能性があれば ${off('etcdQuotaMax')} GiB より大きく）`,
      formula: 'etcd 専用ディスク > etcd のディスククォータ（既定 8 GiB、8〜32 GiB で設定可能）',
      refs: ['etcdQuotaDefault', 'etcdQuotaMax'],
      note: 'クォータを増やす場合、コントロールプレーンには追加のメモリとストレージが必要。OS・イメージ用のディスク（100 GB 以上）とは別に考える',
    },
    {
      id: `${P}.etcdPerf`,
      label: 'etcd 用ディスクの性能',
      kind: has(m.fsyncMs) ? 'measured' : 'official_min',
      status: has(m.fsyncMs) ? (m.fsyncMs.v < off('etcdFsyncP99') ? 'ok' : 'ng') : 'unconfirmed',
      text: `8 KB のシーケンシャル同期書き込みで ${off('etcdSeqWriteIops')} IOPS 以上を 10 ms 未満（高負荷クラスタは ${off('etcdSeqWriteIopsHeavy')} IOPS を 2 ms）、WAL の p99 fsync は ${off('etcdFsyncP99')} ms 未満${has(m.fsyncMs) ? `／実測 ${fmt(m.fsyncMs.v)} ms` : ''}`,
      refs: ['etcdSeqWriteIops', 'etcdSeqWriteIopsHeavy', 'etcdFsyncP99'],
      note: 'インストール前に fio（etcd-perf）で測る。インストール最低要件の 300 IOPS とは別の条件',
      missing: has(m.fsyncMs) ? undefined : ['etcd 用ディスクの p99 fsync（fio などで実測）'],
    },
    {
      id: `${P}.etcdRtt`,
      label: 'コントロールプレーン間のネットワーク（etcd）',
      kind: has(m.rttMs) ? 'measured' : 'official_rec',
      status: has(m.rttMs) ? (m.rttMs.v < off('etcdRttP99') ? 'ok' : 'ng') : 'unconfirmed',
      text: `etcd メンバー間の p99 RTT が ${off('etcdRttP99')} ms 未満${has(m.rttMs) ? `／実測 ${fmt(m.rttMs.v)} ms` : ''}。TCP 2379–2380 を開ける`,
      refs: ['etcdRttP99', 'portRequirements'],
      missing: has(m.rttMs) ? undefined : ['etcd メンバー間の p99 RTT（実測）'],
    },
    {
      id: `${P}.cpDisk`,
      label: 'コントロールプレーンの OS・イメージ用ディスク（1 台）',
      kind: 'official_min',
      status: 'info',
      text: `${off('installCpDisk')} GB 以上・${off('installCpIops')} IOPS 以上（+ Virtualization 約 ${off('virtStoragePerNode')} GiB）。etcd は上の専用ディスクに分けることを推奨`,
      refs: ['installCpDisk', 'installCpIops', 'virtStoragePerNode', 'etcdDisk'],
    },
  ];

  // ---- 基盤サービスのストレージ ----
  const reg = model.services.find((s) => s.kind === 'registry' && s.placement !== 'none');
  const regCap = reg && has(reg.capacityBytes) ? reg.capacityBytes.v : null;
  const regReplicas = reg && has(reg.replicas) ? reg.replicas.v : null;
  const regMin = off('registryMinCapacity') * GiB;
  const storageItems: ResultItem[] = [
    {
      id: `${P}.registry`,
      label: 'イメージレジストリの永続ボリューム',
      kind: regCap !== null ? 'input' : 'official_min',
      status: regCap === null ? 'info' : regCap >= regMin ? 'ok' : 'ng',
      value: regCap ?? regMin,
      unit: 'bytes',
      text:
        regCap === null
          ? `以上（${OFFICIAL.registryMinCapacity.unit}）。レプリカ 1 台なら RWO（Recreate）、2 台以上の高可用構成なら RWX のストレージが必要`
          : `／最低 ${fmtBytes(regMin)}${regReplicas !== null && regReplicas >= 2 ? '。レプリカ 2 台以上のため RWX のストレージが必要' : ''}`,
      refs: ['registryMinCapacity'],
      note: '本番クラスタでは永続ボリュームが必要（ベアメタルなど既定のストレージがない環境では、インストール後に設定する）',
    },
  ];
  const total = computeCount !== null ? cpCount + computeCount + (model.infraEnabled && has(model.roles.infra.count) ? model.roles.infra.count.v : 0) : null;
  const promRow = total !== null ? selectPromRow(total) : null;
  const promStatus: Status = total === null ? 'not_calculated' : promRow ? 'calculated' : 'individual';
  storageItems.push({
    id: `${P}.prom`,
    label: '監視（Prometheus）の保存量の参考値',
    kind: 'official_rec',
    status: promStatus,
    text: promRow
      ? `1 日あたり ${fmt(promRow.perDayGB)} GB、15 日（既定の保持期間）で ${fmt(promRow.per15DaysGB)} GB（試験条件：${promRow.nodes} ノード・${fmt(promRow.pods)} Pod）`
      : total !== null
        ? `全 ${fmt(total)} ノードは公式試験（200 ノードまで）の範囲を超えるため要個別評価`
        : undefined,
    basis: [b('全ノード数（コントロールプレーン + コンピュート + インフラ）', total !== null ? `${fmt(total)} 台` : '未算出')],
    refs: promRow ? [promRow.id, 'promStorage', 'promRetentionDefault'] : ['promStorage'],
    note: '規範値ではなく参考値（約 20% の余裕込み）。全ノードが収まる最小の試験行を選ぶ（補間なし）。Pod・Route などメトリクスを出すリソースが多いと増える',
    missing: total === null ? ['コンピュートの台数（候補台数または必要台数）'] : undefined,
  });

  // ---- ネットワークの前提 ----
  const ingressNodes = model.infraEnabled ? 'インフラノード' : 'コンピュートノード';
  const netItems: ResultItem[] = [
    {
      id: `${P}.lb`,
      label: 'ロードバランサー（API・Ingress）',
      kind: 'official_min',
      status: 'info',
      text: `API：L4 で 6443（/readyz でヘルスチェック）と 22623（内部のみ）をコントロールプレーンへ、セッション維持なし。Ingress：L4 で 443・80 を Ingress Controller が動くノード（この構成では${ingressNodes}）へ`,
      refs: ['lbRequirements'],
      note: 'ユーザープロビジョニング（UPI）でインストール前に用意する。インストール方式によってはクラスタ内の仕組みで提供される',
    },
    {
      id: `${P}.dns`,
      label: 'DNS レコード',
      kind: 'official_min',
      status: 'info',
      text: 'api・api-int・*.apps・bootstrap・各コントロールプレーン・各コンピュートの正引き。API・ブートストラップ・コントロールプレーン・コンピュートは逆引き（PTR）も',
      refs: ['dnsRequirements'],
    },
    {
      id: `${P}.ports`,
      label: 'ノード間の通信ポート',
      kind: 'official_min',
      status: 'info',
      text: 'TCP 2379–2380（etcd）、6443（API）、22623（MCS）、10250–10259、9000–9999、30000–32767（NodePort）、UDP 6081（Geneve）、9000–9999、123（NTP）など',
      refs: ['portRequirements'],
    },
    {
      id: `${P}.ntp`,
      label: '時刻同期（NTP）',
      kind: 'official_default',
      status: 'info',
      text: '既定は公開 NTP サーバー。社内 NTP や非接続環境では chrony で指定する',
      refs: ['ntp'],
    },
  ];

  const sections: Section[] = [
    { id: 'foundation-etcd', title: 'etcd とコントロールプレーン', items: etcdItems },
    { id: 'foundation-storage', title: '基盤サービスのストレージ（VM ディスクとは別）', items: storageItems },
    { id: 'foundation-net', title: 'インストール前に用意するネットワーク', items: netItems },
  ];
  return { sections, totalNodes: total, promRow, promStatus, cpFailureTolerance: tol, items: [...etcdItems, ...storageItems, ...netItems] };
}
