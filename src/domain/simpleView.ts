// 簡易版の結果表示（画面と印刷で共通）。詳細版と同じ計算結果から組み立てる。
import { fmt, fmtBytes, fmtMiB, type Kind, type ResultItem, type SizingResult, type Status } from './result';
import { CP_SCALE_ROWS, INFRA_SCALE_ROWS, OFFICIAL, PROM_STORAGE_ROWS } from './sources';
import type { SimpleInput } from './simple';

export interface SimpleRow {
  label: string;
  value: string;
  kind: Kind;
  status?: Status;
  note?: string;
  refs?: string[];
}

export interface SimpleCard {
  title: string;
  value: string;
  sub: string;
  status?: Status;
}

export interface SimpleReason {
  title: string;
  text: string;
}

export interface FoundationTile {
  kind: Kind;
  title: string;
  value: string;
  sub: string;
  refs: string[];
  status?: Status;
}

export interface SimpleView {
  verdict: { status: Status; headline: string; details: string[] };
  /** OpenShift 基盤としての要件（VM の要求量とは別） */
  foundation: FoundationTile[];
  /** 結論のすぐ下に並べる 3 ロールの台数と 1 台あたりの目安 */
  cards: SimpleCard[];
  /** なぜこの台数か */
  reasons: SimpleReason[];
  sections: { title: string; rows: SimpleRow[] }[];
}

/** 簡易版で結果を表示するグループ（ネットワーク・サービス等は詳細版で扱う） */
export const SIMPLE_GROUP_IDS = ['vm', 'compute', 'controlPlane', 'infra', 'foundation', 'storage', 'bootstrap'];

/** 簡易版の確認事項に出す項目（簡易版で尋ねない候補仕様などの「未入力」は出さない） */
export function isSimpleOpenItem(itemId: string): boolean {
  return (
    /^vmTotal\./.test(itemId) ||
    /^vm\.[^.]+\.(cpuReq|memPerVm|diskTotal|limits)$/.test(itemId) ||
    /^compute\.(required|scNormal|scFail|scDrain|candMin|vmCpuPerNode|vmMemPerNode|limitHosts|limitVms)$/.test(itemId) ||
    /^(cp|infra)\.scaleRow$/.test(itemId) ||
    /^foundation\.(cpCount|prom)$/.test(itemId) ||
    /^storage\.[^.]+\.physical$/.test(itemId)
  );
}

/** 簡易版では入力しないが、導入前に実環境で確かめること（公式資料の確認項目） */
export const SIMPLE_CHECKLIST: { text: string; refs: string[] }[] = [
  { text: 'etcd を置くディスクの p99 fsync が 10 ms 未満、etcd メンバー間の p99 RTT が 50 ms 未満であること', refs: ['etcdFsyncP99', 'etcdRttP99'] },
  { text: 'コントロールプレーンの平常時の CPU・メモリ使用率が 60% 以下に収まること（大規模・高密度の 3 台構成）', refs: ['cpUtilGuideline'] },
  { text: 'ライブマイグレーションさせる VM のディスクが RWX（ReadWriteMany）の共有ストレージにあり、ノード間で CPU に互換性があること', refs: ['migration'] },
  { text: 'ライブマイグレーション用に専用の Multus ネットワークを用意すること（強い推奨）', refs: ['migration'] },
  { text: 'VM を動かす Worker が RHCOS で、CPU の仮想化拡張が有効なこと', refs: ['rhcos', 'platforms'] },
  { text: '共有ストレージの性能（IOPS・スループット・レイテンシ）と、ネットワーク帯域が足りること（詳細入力で確かめられます）', refs: ['storage'] },
];

const pct = (v: number) => `${fmt(Math.round(v * 10) / 10)} %`;

export function buildSimpleView(simple: SimpleInput, result: SizingResult): SimpleView {
  const items = new Map<string, ResultItem>();
  result.groups.forEach((g) => g.sections.forEach((s) => s.items.forEach((i) => items.set(i.id, i))));
  const it = (id: string) => items.get(id);
  const disp = (id: string) => {
    const x = it(id);
    return x && x.value !== undefined ? (x.display ?? '') : '未算出';
  };
  const f = result.figures;
  const tol = Number(simple.tolerance);

  // ---- 判定 ----
  const details: string[] = [];
  let status: Status;
  let headline: string;
  const required = f.computeRequired;
  const reqText = required !== null ? `${fmt(required)} 台` : '未算出';
  if (f.computeRequiredStatus === 'ng') {
    status = 'ng';
    headline = '1 台の物理サーバに収まらない VM があります';
    const r = it('compute.required');
    if (r?.text) details.push(r.text);
  } else if (required === null) {
    status = 'not_calculated';
    headline = '必要台数を計算するための入力が不足しています';
    const miss = new Set<string>();
    ['vmTotal.cpuReq', 'vmTotal.mem', 'compute.vmCpuPerNode', 'compute.vmMemPerNode'].forEach((id) => it(id)?.missing?.forEach((m) => miss.add(m)));
    if (miss.size) details.push(`不足：${[...miss].join('、')}`);
  } else if (f.computeCandidate === null) {
    status = 'calculated';
    headline = `VM 用の物理サーバは ${reqText} 必要です`;
    details.push(`停止・メンテナンスを許容する ${tol} 台を含みます。物理サーバ台数を入力すると、その台数で収まるかを判定します。`);
  } else if (f.computeCandidateStatus === 'ok' || f.computeCandidateStatus === 'individual') {
    status = f.computeCandidateStatus;
    headline = `物理サーバ ${fmt(f.computeCandidate)} 台で収まります（必要 ${reqText}）`;
    details.push(`停止・メンテナンスを許容する ${tol} 台を含めて評価しています。`);
  } else if (f.computeCandidateStatus === 'ng') {
    status = 'ng';
    headline = `物理サーバ ${fmt(f.computeCandidate)} 台では不足します（必要 ${reqText}）`;
    ['compute.scNormal', 'compute.scFail', 'compute.scDrain', 'compute.candMin']
      .map((id) => it(id))
      .filter((x): x is ResultItem => !!x && x.status === 'ng')
      .forEach((x) => details.push(`${x.label}：${x.display ?? ''}`));
  } else {
    status = f.computeCandidateStatus;
    headline = `物理サーバ ${fmt(f.computeCandidate)} 台の評価：必要台数は ${reqText}`;
  }
  details.push('コントロールプレーン 3 台' + (f.infraEnabled ? 'とインフラノード 3 台' : '') + 'は、VM 用サーバとは別に必要です。');

  // ---- VM の合計 ----
  const vmRows: SimpleRow[] = [
    { label: 'VM 台数（合計）', value: disp('vmTotal.defined'), kind: 'derived' },
    { label: '総 vCPU', value: disp('vmTotal.vcpu'), kind: 'derived' },
    { label: `CPU 要求量（割り当て比率 ${simple.cpuRatio}:1）`, value: disp('vmTotal.cpuReq'), kind: 'derived', refs: ['cpuAllocationRatio'] },
    { label: 'メモリ要求量（VM 追加メモリを含む）', value: disp('vmTotal.mem'), kind: 'derived', refs: ['vmMemOverheadBase'] },
    { label: 'ディスク（論理容量）', value: disp('vmTotal.disk'), kind: 'derived' },
    {
      label: 'ディスク（物理容量）',
      value: f.physicalBytes !== null ? `${fmtBytes(f.physicalBytes)}（係数 × ${simple.storageFactor}、空き容量を含まない）` : '未算出（物理容量係数が未入力）',
      kind: 'derived',
      status: f.physicalBytes !== null ? 'unconfirmed' : 'not_calculated',
    },
  ];

  // ---- VM 用物理サーバ ----
  const n = f.computeCandidate ?? required;
  const capRows: SimpleRow[] = [
    { label: '必要台数（停止許容分を含む）', value: reqText, kind: 'derived', status: f.computeRequiredStatus, refs: ['installComputeCount', 'migrationReserve'] },
    { label: '入力した台数', value: f.computeCandidate !== null ? `${fmt(f.computeCandidate)} 台` : '未入力', kind: 'input', status: f.computeCandidate !== null ? f.computeCandidateStatus : undefined },
    {
      label: '1 台で VM に使える CPU',
      value: f.vmCpuPerNode !== null ? `${fmt(f.vmCpuPerNode)} コア` : '未算出',
      kind: 'derived',
      note: 'Allocatable − 常駐 Pod − Virtualization の Worker 分（約 2 コア）',
      refs: ['OCP-NODES', 'virtCpuPerWorker'],
    },
    {
      label: '1 台で VM に使えるメモリ',
      value: f.vmMemPerNodeMiB !== null ? fmtMiB(f.vmMemPerNodeMiB) : '未算出',
      kind: 'derived',
      note: 'Allocatable − 常駐 Pod − Virtualization の Worker 分（約 360 MiB）',
      refs: ['OCP-NODES', 'virtMemPerWorker'],
    },
  ];
  if (n !== null && f.vmCpuPerNode && f.vmMemPerNodeMiB && f.totalCpuDemand !== null && f.totalMemDemandMiB !== null) {
    const label = f.computeCandidate !== null ? `入力した ${fmt(n)} 台` : `必要台数 ${fmt(n)} 台`;
    capRows.push({
      label: `平常時の使用率（${label}）`,
      value: `CPU ${pct((f.totalCpuDemand / (f.vmCpuPerNode * n)) * 100)}、メモリ ${pct((f.totalMemDemandMiB / (f.vmMemPerNodeMiB * n)) * 100)}`,
      kind: 'derived',
      note: 'VM に使える容量の合計に対する要求量の割合（実際の負荷率ではない）',
    });
    if (tol > 0 && n - tol >= 1) {
      capRows.push({
        label: `${tol} 台停止時の使用率（残り ${fmt(n - tol)} 台）`,
        value: `CPU ${pct((f.totalCpuDemand / (f.vmCpuPerNode * (n - tol))) * 100)}、メモリ ${pct((f.totalMemDemandMiB / (f.vmMemPerNodeMiB * (n - tol))) * 100)}`,
        kind: 'derived',
      });
    }
  }
  for (const id of ['compute.scNormal', 'compute.scFail', 'compute.scDrain']) {
    const x = it(id);
    if (x) capRows.push({ label: x.label, value: x.display ?? '', kind: x.kind, status: x.status, refs: x.refs });
  }

  // ---- コントロールプレーン ----
  const cpRow = CP_SCALE_ROWS.find((r) => r.id === f.cpRowId);
  const cpRows: SimpleRow[] = [
    { label: '台数', value: `${OFFICIAL.installCpCount.value} 台（VM 用サーバとは別）`, kind: 'official_min', refs: ['installCpCount'] },
    {
      label: '1 台あたりの CPU',
      value: `${fmt(f.cpPerNodeCpu)} コア以上`,
      kind: cpRow ? 'official_rec' : 'official_min',
      status: f.cpRowStatus === 'individual' ? 'individual' : undefined,
      note: cpRow
        ? `インストール最低要件 ${OFFICIAL.installCpCpu.value} vCPU と、公式試験の参考点 ${cpRow.cpuCores} コア（コンピュート ${cpRow.nodes} 台・${fmt(cpRow.namespaces)} Namespace）の大きい方`
        : f.cpRowStatus === 'individual'
          ? '公式試験の適用範囲を超えるため要個別評価。値はインストール最低要件'
          : 'インストール最低要件。Namespace 数を入力すると公式試験の参考点も反映します',
      refs: cpRow ? ['installCpCpu', cpRow.id] : ['installCpCpu'],
    },
    {
      label: '1 台あたりのメモリ',
      value: `${fmt(f.cpPerNodeMemGB)} GB 以上`,
      kind: cpRow ? 'official_rec' : 'official_min',
      refs: cpRow ? ['installCpRam', cpRow.id] : ['installCpRam'],
    },
    {
      label: '1 台あたりのディスク',
      value: `${OFFICIAL.installCpDisk.value} GB 以上・${OFFICIAL.installCpIops.value} IOPS 以上（+ Virtualization 約 ${OFFICIAL.virtStoragePerNode.value} GiB）`,
      kind: 'official_min',
      note: 'etcd 用に p99 fsync 10 ms 未満、メンバー間 p99 RTT 50 ms 未満を確認',
      refs: ['installCpDisk', 'virtStoragePerNode', 'etcdFsyncP99', 'etcdRttP99'],
    },
  ];

  // ---- インフラ ----
  const infraRows: SimpleRow[] = [];
  if (f.infraEnabled) {
    const row = INFRA_SCALE_ROWS.find((r) => r.id === f.infraRowId);
    infraRows.push({ label: '台数', value: `${OFFICIAL.infraRecommendedCount.value} 台（一般推奨、VM 用サーバとは別）`, kind: 'official_rec', refs: ['infraRecommendedCount'] });
    if (row && f.infraPerNodeGuideCpu !== null && f.infraPerNodeGuideMemMiB !== null) {
      infraRows.push({
        label: '1 台あたりの CPU（目安）',
        value: `${fmt(f.infraPerNodeGuideCpu)} コア`,
        kind: 'derived',
        note: `公式試験の参考サイズ ${row.cpuCores} コア + Virtualization のインフラ分 4 コアを 3 台で均等に分けた概算`,
        refs: [row.id, 'virtCpuInfraTotal'],
      });
      infraRows.push({
        label: '1 台あたりのメモリ（目安）',
        value: fmtMiB(f.infraPerNodeGuideMemMiB),
        kind: 'derived',
        note: `公式試験の参考サイズ ${row.memoryGB} GB + Virtualization 分（2,179 MiB ÷ 3 + 150 MiB）`,
        refs: [row.id, 'virtMemInfraTotal', 'virtMemPerInfraNode'],
      });
    } else {
      infraRows.push({
        label: '1 台あたりの CPU・メモリ',
        value: f.infraRowStatus === 'individual' ? '要個別評価（公式試験の適用範囲外）' : '未算出',
        kind: 'official_rec',
        status: f.infraRowStatus === 'individual' ? 'individual' : 'not_calculated',
        note: f.infraRowStatus === 'individual' ? undefined : 'Namespace 数を入力すると公式試験の参考サイズを表示します',
      });
    }
  } else {
    infraRows.push({ label: 'インフラノード', value: '使わない（Virtualization のインフラ分を VM 用サーバに計上）', kind: 'input', status: 'na' });
  }

  const bootRows: SimpleRow[] = [
    {
      label: 'ブートストラップ（インストール時のみ）',
      value: `${OFFICIAL.installBootstrapCount.value} 台：${OFFICIAL.installBootstrapCpu.value} vCPU・${OFFICIAL.installBootstrapRam.value} GB・${OFFICIAL.installBootstrapDisk.value} GB`,
      kind: 'official_min',
      refs: ['installBootstrapCpu'],
    },
  ];

  // ---- カード ----
  const cards: SimpleCard[] = [
    {
      title: 'VM 用の物理サーバ',
      value: f.computeCandidate !== null ? `${fmt(f.computeCandidate)} 台（必要 ${reqText}）` : `必要 ${reqText}`,
      sub: `${simple.servers.cpu || '—'} 論理コア・${simple.servers.ram.raw || '—'} ${simple.servers.ram.unit}／台、停止許容 ${tol} 台`,
      status: f.computeCandidate !== null ? f.computeCandidateStatus : f.computeRequiredStatus,
    },
    {
      title: 'コントロールプレーン',
      value: `${OFFICIAL.installCpCount.value} 台 × ${fmt(f.cpPerNodeCpu)} コア・${fmt(f.cpPerNodeMemGB)} GB 以上`,
      sub: `ディスク ${OFFICIAL.installCpDisk.value} GB 以上 + etcd 用の専用 SSD／NVMe。${cpRow ? `公式試験の参考点（${fmt(cpRow.namespaces)} Namespace）とインストール最低要件から` : f.cpRowStatus === 'individual' ? '公式試験の範囲外のため要個別評価' : 'インストール最低要件から'}`,
      status: f.cpRowStatus === 'individual' ? 'individual' : undefined,
    },
    f.infraEnabled
      ? {
          title: 'インフラノード',
          value:
            f.infraPerNodeGuideCpu !== null && f.infraPerNodeGuideMemMiB !== null
              ? `${OFFICIAL.infraRecommendedCount.value} 台 × ${fmt(f.infraPerNodeGuideCpu)} コア・${fmt(f.infraPerNodeGuideMemMiB / 1024)} GiB 目安`
              : `${OFFICIAL.infraRecommendedCount.value} 台`,
          sub:
            f.infraPerNodeGuideCpu !== null
              ? '公式試験の参考サイズ + Virtualization のインフラ分'
              : f.infraRowStatus === 'individual'
                ? '公式試験の範囲外のため要個別評価'
                : '規模（Namespace 数）を選ぶと 1 台あたりの目安を表示',
          status: f.infraRowStatus === 'individual' ? 'individual' : f.infraPerNodeGuideCpu === null ? 'not_calculated' : undefined,
        }
      : { title: 'インフラノード', value: '分けない', sub: 'Virtualization のインフラ分は VM 用サーバに含めて計算', status: 'na' },
  ];

  // ---- なぜこの台数か ----
  const reasons: SimpleReason[] = [];
  if (f.totalCpuDemand !== null && f.vmCpuPerNode) {
    reasons.push({
      title: `CPU から ${fmt(Math.ceil(f.totalCpuDemand / f.vmCpuPerNode - 1e-9))} 台`,
      text: `CPU 要求量 ${fmt(f.totalCpuDemand)} コア ÷ 1 台で VM に使える ${fmt(f.vmCpuPerNode)} コア（割り当て比率 ${simple.cpuRatio}:1）`,
    });
  }
  if (f.totalMemDemandMiB !== null && f.vmMemPerNodeMiB) {
    reasons.push({
      title: `メモリから ${fmt(Math.ceil(f.totalMemDemandMiB / f.vmMemPerNodeMiB - 1e-9))} 台`,
      text: `メモリ要求量 ${fmt(f.totalMemDemandMiB / 1024)} GiB ÷ 1 台で VM に使える ${fmt(f.vmMemPerNodeMiB / 1024)} GiB（VM の追加メモリを含む）`,
    });
  }
  if (required !== null) {
    reasons.push({
      title: tol > 0 ? `${tol} 台止まっても載るように ${reqText}` : `最少台数を満たして ${reqText}`,
      text:
        tol > 0
          ? `残り ${fmt(Math.max(required - tol, 0))} 台にすべての VM が載り、ライブマイグレーション用の予備メモリも確保できる最小の台数（コンピュートは最低 ${OFFICIAL.installComputeCount.value} 台）`
          : `CPU とメモリの両方が足り、すべての VM を配置できる最小の台数（コンピュートは最低 ${OFFICIAL.installComputeCount.value} 台）`,
    });
  }

  // ---- OpenShift 基盤の要件 ----
  const prom = PROM_STORAGE_ROWS.find((r) => r.id === f.promRowId);
  const foundation: FoundationTile[] = [
    {
      kind: 'official_rec',
      title: 'etcd 用ディスク',
      value: `専用 SSD／NVMe、${OFFICIAL.etcdQuotaDefault.value} GiB 超`,
      sub: `p99 fsync ${OFFICIAL.etcdFsyncP99.value} ms 未満、8 KB 同期書き込み ${OFFICIAL.etcdSeqWriteIops.value} IOPS 以上。ネットワーク越しのストレージ（iSCSI・NFS・Ceph RBD など）は避ける`,
      refs: ['etcdDisk', 'etcdQuotaDefault', 'etcdFsyncP99', 'etcdSeqWriteIops'],
      status: 'unconfirmed',
    },
    {
      kind: 'official_default',
      title: 'コントロールプレーンの障害許容',
      value: f.cpFailureTolerance !== null ? `3 台で ${f.cpFailureTolerance} 台まで停止可` : '—',
      sub: `etcd の過半数を保てる台数。ベアメタルなら最大 ${OFFICIAL.cpCountMaxBareMetal.value} 台（5 台で 2 台まで）にできる`,
      refs: ['etcdFailureTolerance', 'cpCountMaxBareMetal'],
    },
    {
      kind: 'official_min',
      title: 'イメージレジストリ',
      value: `永続ボリューム ${OFFICIAL.registryMinCapacity.value} GiB 以上`,
      sub: 'レプリカ 2 台以上の高可用構成は RWX のストレージが必要（1 台なら RWO）',
      refs: ['registryMinCapacity'],
    },
    {
      kind: 'official_rec',
      title: '監視（Prometheus）の保存量',
      value: prom ? `15 日で約 ${fmt(prom.per15DaysGB)} GB` : f.promStatus === 'individual' ? '要個別評価' : '未算出',
      sub: prom
        ? `全 ${fmt(f.totalNodes ?? 0)} ノード → 公式試験（${prom.nodes} ノード・1 日 ${fmt(prom.perDayGB)} GB）の参考値`
        : f.promStatus === 'individual'
          ? '公式試験（200 ノードまで）の範囲を超える'
          : 'サーバ台数が決まると表示します',
      refs: prom ? [prom.id, 'promStorage'] : ['promStorage'],
      status: f.promStatus === 'individual' ? 'individual' : undefined,
    },
    {
      kind: 'official_min',
      title: 'ロードバランサー・DNS・NTP',
      value: 'インストール前に用意',
      sub: 'API（6443・22623）と Ingress（443・80）の L4 ロードバランサー、api・api-int・*.apps などの DNS と逆引き、ノード間ポート、NTP',
      refs: ['lbRequirements', 'dnsRequirements', 'portRequirements', 'ntp'],
    },
  ];

  return {
    verdict: { status, headline, details },
    foundation,
    cards,
    reasons,
    sections: [
      { title: 'VM の合計', rows: vmRows },
      { title: 'VM 用の物理サーバ（コンピュートノード）', rows: capRows },
      { title: 'コントロールプレーン', rows: cpRows },
      { title: 'インフラノード', rows: infraRows },
      {
        title: 'OpenShift 基盤の要件（VM の要求量とは別）',
        rows: foundation.map((t) => ({ label: t.title, value: t.value, kind: t.kind, status: t.status, note: t.sub, refs: t.refs })),
      },
      { title: 'その他', rows: bootRows },
    ],
  };
}
