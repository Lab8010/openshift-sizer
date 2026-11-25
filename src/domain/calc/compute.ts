// コンピュートノード（VM をホストする Worker）の計算。
import { has, type SizingModel } from '../parse';
import { fmt, fmtMiB, type ResultItem, type Section, type Status, type Table } from '../result';
import { b, need, nvText, off, T } from './helpers';
import { calcAllocatable } from './nodes';
import { findMinNodes, fitsEmptyNode, place, type NodeCapacity, type PlaceGroup, type PlacementResult } from './placement';
import { installMinItems, localDiskItems } from './roleChecks';
import type { ServicesCalc } from './services';
import type { VmCalc, VmTotals } from './vm';

export interface ComputeCalc {
  sections: Section[];
  vmCpuPerNode: number | null;
  vmMemPerNodeMiB: number | null;
  allocCpu: number | null;
  allocMemMiB: number | null;
  required: number | null;
  requiredStatus: Status;
  candidate: number | null;
  /** 評価に使った台数（候補台数、なければ必要台数） */
  evaluatedCount: number | null;
  placementAtEvaluated: PlacementResult | null;
  maxNodeMemMiB: number | null;
  reserveMiB: number | null;
  totalCpuDemand: number | null;
  totalMemDemandMiB: number | null;
  extrasCpu: number;
  extrasMemMiB: number;
  placementStatus: Status;
  candidateStatus: Status;
  items: ResultItem[];
}

const UPPER_LIMIT = 10000;

export function calcCompute(model: SizingModel, vms: VmCalc[], totals: VmTotals, svc: ServicesCalc): ComputeCalc {
  const role = model.roles.compute;
  const P = 'compute';
  const alloc = calcAllocatable(role, P, 'コンピュート');
  const capItems: ResultItem[] = [...alloc.items];

  // --- VM 用に残る容量 ---
  const virtCpu = role.residentIncludesVirt ? 0 : off('virtCpuPerWorker');
  const virtMem = role.residentIncludesVirt ? 0 : off('virtMemPerWorker');
  capItems.push({
    id: `${P}.virtNode`,
    label: 'Virtualization の Worker ノード分（1 台）',
    kind: role.residentIncludesVirt ? 'input' : 'official_default',
    status: 'calculated',
    text: role.residentIncludesVirt ? '常駐 Pod の実測要求に含めて入力済み（二重計上しない）' : `CPU 約 ${off('virtCpuPerWorker')} コア、メモリ約 ${off('virtMemPerWorker')} MiB`,
    refs: ['virtCpuPerWorker', 'virtMemPerWorker'],
  });
  const mCpu: string[] = [...alloc.missingCpu];
  const mMem: string[] = [...alloc.missingMem];
  const resCpu = need(role.residentCpu, '常駐 Pod の CPU 要求量', mCpu);
  const resMem = need(role.residentMemMiB, '常駐 Pod のメモリ要求量', mMem);
  const vmCpu = alloc.cpu !== null && resCpu !== null ? alloc.cpu - resCpu - virtCpu : null;
  const vmMem = alloc.memMiB !== null && resMem !== null ? alloc.memMiB - resMem - virtMem : null;
  capItems.push({
    id: `${P}.vmCpuPerNode`,
    label: 'VM 用に残る CPU（1 台）',
    kind: 'derived',
    status: vmCpu === null ? 'not_calculated' : vmCpu > 0 ? 'calculated' : 'ng',
    value: vmCpu ?? undefined,
    unit: 'cores',
    formula: 'Allocatable CPU − 常駐 Pod の CPU 要求量 − Virtualization の Worker 分',
    basis: [b('Allocatable CPU', alloc.cpu !== null ? fmt(alloc.cpu) : '未算出'), b('常駐 Pod', T.num(role.residentCpu)), b('Virtualization 分', fmt(virtCpu))],
    refs: ['virtCpuPerWorker', 'OCP-NODES'],
    missing: mCpu.length ? mCpu : undefined,
  });
  capItems.push({
    id: `${P}.vmMemPerNode`,
    label: 'VM 用に残るメモリ（1 台）',
    kind: 'derived',
    status: vmMem === null ? 'not_calculated' : vmMem > 0 ? 'calculated' : 'ng',
    value: vmMem ?? undefined,
    unit: 'mib',
    formula: 'Allocatable メモリ − 常駐 Pod のメモリ要求量 − Virtualization の Worker 分',
    basis: [b('Allocatable メモリ', alloc.memMiB !== null ? fmtMiB(alloc.memMiB) : '未算出'), b('常駐 Pod', T.mib(role.residentMemMiB)), b('Virtualization 分', `${fmt(virtMem)} MiB`)],
    refs: ['virtMemPerWorker', 'OCP-NODES'],
    missing: mMem.length ? mMem : undefined,
  });

  // --- Pod 枠 ---
  const kvm = off('limitKvmDevices');
  const podCap = has(role.podSlots) ? Math.min(role.podSlots.v, kvm) : kvm;
  capItems.push({
    id: `${P}.podSlots`,
    label: '1 台に置ける VM 数の上限（Pod 枠・KVM デバイス）',
    kind: has(role.podSlots) ? 'input' : 'official_default',
    status: has(role.podSlots) ? 'calculated' : 'unconfirmed',
    value: podCap,
    unit: 'count',
    text: has(role.podSlots) ? '台（残りの Pod 枠と KVM デバイス既定 1,000 の小さい方）' : '台（KVM デバイス既定値のみ。残りの Pod 枠は未入力）',
    note: 'このアプリの仮定：VM 1 台 = virt-launcher Pod 1 個。maxPods の既定値は 250 Pod／ノード（常駐 Pod を含む）',
    refs: ['limitKvmDevices', 'maxPodsDefault'],
    missing: has(role.podSlots) ? undefined : ['残りの Pod 枠'],
  });

  // --- 需要（VM + コンピュートに置くサービス + インフラを使わない場合の Virtualization 分） ---
  const onCompute = svc.byPlacement.compute;
  let extrasCpu = onCompute.cpu;
  let extrasMem = onCompute.memMiB;
  const demandItems: ResultItem[] = [];
  if (!model.infraEnabled) {
    extrasCpu += off('virtCpuInfraTotal');
    extrasMem += off('virtMemInfraTotal');
    demandItems.push({
      id: `${P}.virtInfraOnCompute`,
      label: 'Virtualization のインフラ追加分（インフラノードを使わないためコンピュートで負担、クラスタ全体で 1 回）',
      kind: 'official_default',
      status: 'calculated',
      text: `CPU 約 ${off('virtCpuInfraTotal')} コア、メモリ約 ${off('virtMemInfraTotal')} MiB（ノード数を掛けない）`,
      refs: ['virtCpuInfraTotal', 'virtMemInfraTotal'],
    });
  }
  if (onCompute.services.length) {
    demandItems.push({
      id: `${P}.svcOnCompute`,
      label: 'コンピュートに配置するサービスの要求量（合計）',
      kind: 'derived',
      status: onCompute.missing.length ? 'not_calculated' : 'calculated',
      text: `CPU ${fmt(onCompute.cpu)} コア、メモリ ${fmtMiB(onCompute.memMiB)}（${onCompute.services.join('、')}）`,
      missing: onCompute.missing.length ? onCompute.missing.map((n) => `${n} の要求量`) : undefined,
    });
  }
  const extrasKnown = onCompute.missing.length === 0;
  const totalCpu = totals.cpuReq !== null && extrasKnown ? totals.cpuReq + extrasCpu : null;
  const totalMem = totals.memMiB !== null && extrasKnown ? totals.memMiB + extrasMem : null;
  demandItems.push({
    id: `${P}.totalCpu`,
    label: '総 CPU 要求量（VM + コンピュート上の追加分）',
    kind: 'derived',
    status: totalCpu === null ? 'not_calculated' : 'calculated',
    value: totalCpu ?? undefined,
    unit: 'cores',
    formula: 'VM の Pod CPU 要求量合計 + コンピュートに置くサービス + （インフラなしの場合）Virtualization のインフラ分',
    basis: [b('VM の Pod CPU 要求量合計', totals.cpuReq !== null ? fmt(totals.cpuReq) : '未算出'), b('追加分', fmt(extrasCpu))],
    missing: totalCpu === null ? ['VM の CPU 要求量またはサービス要求量'] : undefined,
  });
  demandItems.push({
    id: `${P}.totalMem`,
    label: '総メモリ要求量（VM + コンピュート上の追加分）',
    kind: 'derived',
    status: totalMem === null ? 'not_calculated' : 'calculated',
    value: totalMem ?? undefined,
    unit: 'mib',
    formula: 'VM メモリ要求量合計 + コンピュートに置くサービス + （インフラなしの場合）Virtualization のインフラ分',
    basis: [b('VM メモリ要求量合計', totals.memMiB !== null ? fmtMiB(totals.memMiB) : '未算出'), b('追加分', fmtMiB(extrasMem))],
    missing: totalMem === null ? ['VM のメモリ要求量またはサービス要求量'] : undefined,
  });

  // --- 台数の下限 ---
  const countItems: ResultItem[] = [];
  const nCpu = totalCpu !== null && vmCpu !== null && vmCpu > 0 ? Math.ceil(totalCpu / vmCpu - 1e-9) : null;
  const nMem = totalMem !== null && vmMem !== null && vmMem > 0 ? Math.ceil(totalMem / vmMem - 1e-9) : null;
  const nPods = totals.running !== null && podCap > 0 ? Math.ceil(totals.running / podCap) : null;
  const nMin = off('installComputeCount');
  countItems.push({
    id: `${P}.nCpu`,
    label: 'CPU から求めた台数',
    kind: 'derived',
    status: nCpu === null ? 'not_calculated' : 'calculated',
    value: nCpu ?? undefined,
    unit: 'nodes',
    formula: 'ceil(総 CPU 要求量 ÷ 1 台の VM 用 CPU)',
    basis: [b('総 CPU 要求量', totalCpu !== null ? `${fmt(totalCpu)} コア` : '未算出'), b('1 台の VM 用 CPU', vmCpu !== null ? `${fmt(vmCpu)} コア` : '未算出')],
    missing: nCpu === null ? [...(totalCpu === null ? ['総 CPU 要求量'] : []), ...mCpu] : undefined,
  });
  countItems.push({
    id: `${P}.nMem`,
    label: 'メモリから求めた台数',
    kind: 'derived',
    status: nMem === null ? 'not_calculated' : 'calculated',
    value: nMem ?? undefined,
    unit: 'nodes',
    formula: 'ceil(総メモリ要求量 ÷ 1 台の VM 用メモリ)',
    basis: [b('総メモリ要求量', totalMem !== null ? fmtMiB(totalMem) : '未算出'), b('1 台の VM 用メモリ', vmMem !== null ? fmtMiB(vmMem) : '未算出')],
    missing: nMem === null ? [...(totalMem === null ? ['総メモリ要求量'] : []), ...mMem] : undefined,
  });
  countItems.push({
    id: `${P}.nPods`,
    label: 'Pod 枠から求めた台数',
    kind: 'derived',
    status: nPods === null ? 'not_calculated' : has(role.podSlots) ? 'calculated' : 'unconfirmed',
    value: nPods ?? undefined,
    unit: 'nodes',
    formula: 'ceil(最大同時稼働 VM 数 ÷ 1 台に置ける VM 数の上限)',
  });
  countItems.push({
    id: `${P}.nMin`,
    label: 'コンピュートの最少台数',
    kind: 'official_min',
    status: 'calculated',
    value: nMin,
    unit: 'nodes',
    refs: ['installComputeCount'],
  });

  // --- 配置 ---
  const groups: PlaceGroup[] | null = vms.every((v) => v.running !== null && v.cpuReq.value !== null && v.memPerVmMiB !== null)
    ? vms.map((v) => ({ key: v.id, name: v.name, cpu: v.cpuReq.value as number, memMiB: v.memPerVmMiB as number, count: v.running as number }))
    : null;
  const special = model.availability.placementConstraints || vms.some((v) => v.special);
  const failU = has(role.unavailable) ? role.unavailable.v : null;
  const drain = has(model.availability.computeDrain) ? model.availability.computeDrain.v : null;

  const capFor = (n: number): NodeCapacity | null => {
    if (vmCpu === null || vmMem === null || n <= 0) return null;
    return { cpu: vmCpu - extrasCpu / n, memMiB: vmMem - extrasMem / n, pods: podCap };
  };
  const placeN = (n: number): PlacementResult | null => {
    const cap = capFor(n);
    if (!groups || !cap) return null;
    return place(groups, n, cap);
  };
  const reserveOk = (r: PlacementResult): boolean => drain === null || r.freeMemMiB + 1e-6 >= drain * r.maxNodeMemMiB;

  let required: number | null = null;
  let requiredStatus: Status = 'not_calculated';
  let largestIssue: string | null = null;
  const lower = nCpu !== null && nMem !== null && nPods !== null ? Math.max(nCpu, nMem, nPods, nMin) : null;
  if (groups && vmCpu !== null && vmMem !== null && extrasKnown) {
    // 1 台に収まらない VM（空のノードでも置けない）
    const big = capFor(Math.max(lower ?? 1, 1));
    for (const g of groups) {
      if (g.count > 0 && big) {
        const r = fitsEmptyNode(g, { cpu: vmCpu, memMiB: vmMem, pods: podCap });
        if (r) largestIssue = `VM「${g.name}」: ${r}`;
      }
    }
    if (!largestIssue && lower !== null) {
      const ok = (n: number) => {
        const r = placeN(n);
        if (!r || !r.ok) return false;
        if (failU !== null && failU > 0) {
          if (n - failU < 1) return false;
          const rf = placeN(n - failU);
          if (!rf || !rf.ok) return false;
        }
        return reserveOk(r);
      };
      required = findMinNodes(lower, Math.max(UPPER_LIMIT, lower), ok);
      requiredStatus = required === null ? 'individual' : special ? 'individual' : 'calculated';
    } else if (largestIssue) {
      requiredStatus = 'ng';
    }
  }
  const scenarioNotes: string[] = [];
  if (failU === null) scenarioNotes.push('障害・メンテナンスで利用できないノード数が未入力のため、停止時の評価は含みません');
  if (drain === null) scenarioNotes.push('同時 drain ノード数が未入力のため、移行用予備メモリの評価は含みません');
  countItems.push({
    id: `${P}.required`,
    label: 'コンピュートの必要台数（下限）',
    kind: 'derived',
    status: requiredStatus,
    value: required ?? undefined,
    unit: 'nodes',
    text: largestIssue ? `1 台に収まらない VM があります（${largestIssue}）` : required === null && requiredStatus === 'individual' ? '配置を確認できません' : special && required !== null ? '（簡易配置の参考値）' : undefined,
    formula:
      'max(CPU から求めた台数, メモリから求めた台数, Pod 枠から求めた台数, 最少 2 台) から始め、平常時・停止時（n − 利用できない台数）の簡易配置と、移行用予備メモリ（別シナリオ）をすべて満たす最小台数',
    basis: [
      b('下限の候補', lower !== null ? `${lower} 台` : '未算出'),
      b('利用できないノード数', nvText(role.unavailable)),
      b('同時 drain ノード数', nvText(model.availability.computeDrain)),
    ],
    refs: ['installComputeCount', 'migrationReserve', 'OCP-NODES', 'VIRT-LIMITS'],
    note: [
      special ? 'NUMA・アフィニティ・SR-IOV・GPU 等の配置制約があり、簡易配置に反映できないため要個別評価' : '',
      ...scenarioNotes,
      'このアプリの見積もりルール：同一仕様ノードへの分散配置（要求量の大きい VM から、空きが最も多く残るノードへ）',
    ]
      .filter(Boolean)
      .join('。'),
    missing: required === null && requiredStatus === 'not_calculated' ? ['VM の CPU・メモリ要求量、ノードの VM 用容量（Allocatable・常駐 Pod）'] : undefined,
  });

  // --- 候補台数での評価 ---
  const candidate = has(role.count) ? role.count.v : null;
  const evaluated = candidate ?? required;
  const evalItems: ResultItem[] = [];
  let placementAt: PlacementResult | null = null;
  let candidateStatus: Status = 'unconfirmed';
  let placementStatus: Status = 'not_calculated';
  if (candidate !== null) {
    evalItems.push({
      id: `${P}.candMin`,
      label: '候補台数とコンピュート最少台数',
      kind: 'official_min',
      status: candidate >= nMin ? 'ok' : 'ng',
      text: `候補 ${fmt(candidate)} 台 ／ 最少 ${nMin} 台`,
      refs: ['installComputeCount'],
    });
  }
  if (evaluated !== null) {
    placementAt = placeN(evaluated);
    const label = candidate !== null ? `候補 ${fmt(candidate)} 台` : `必要台数 ${fmt(evaluated)} 台`;
    // 平常時
    const normal: Status = !placementAt ? 'not_calculated' : !placementAt.ok ? 'ng' : special ? 'individual' : 'ok';
    placementStatus = normal;
    evalItems.push({
      id: `${P}.scNormal`,
      label: `平常時の配置（${label}）`,
      kind: 'derived',
      status: normal,
      text: !placementAt ? undefined : placementAt.ok ? `すべての VM を配置できました（ノードあたり VM メモリ最大 ${fmtMiB(placementAt.maxNodeMemMiB)}）` : `配置を確認できません：${placementAt.failed?.name ?? ''} — ${placementAt.failed?.reason ?? ''}`,
      missing: !placementAt ? ['VM の要求量、またはノードの VM 用容量'] : undefined,
    });
    // 停止時
    if (failU === null) {
      evalItems.push({ id: `${P}.scFail`, label: '障害・メンテナンス時の配置', kind: 'derived', status: 'unconfirmed', missing: ['コンピュートの利用できないノード数'] });
    } else {
      const rest = evaluated - failU;
      const rf = rest >= 1 ? placeN(rest) : null;
      const st: Status = rest < 1 ? 'ng' : !rf ? 'not_calculated' : !rf.ok ? 'ng' : special ? 'individual' : 'ok';
      evalItems.push({
        id: `${P}.scFail`,
        label: `障害・メンテナンス時の配置（${fmt(failU)} 台停止、残り ${fmt(Math.max(rest, 0))} 台）`,
        kind: 'derived',
        status: st,
        text: rest < 1 ? '残存ノードがありません' : rf ? (rf.ok ? `残存ノードにすべての VM を配置できました（空きメモリ ${fmtMiB(rf.freeMemMiB)}）` : `残存ノードに配置できません：${rf.failed?.name ?? ''} — ${rf.failed?.reason ?? ''}`) : undefined,
        note: '停止台数による残存容量の評価。移行用予備メモリとは別シナリオとして扱い、二重計上しない',
      });
    }
    // 移行用予備メモリ
    if (drain === null) {
      evalItems.push({ id: `${P}.scDrain`, label: 'ライブマイグレーション用の予備メモリ', kind: 'derived', status: 'unconfirmed', refs: ['migrationReserve'], missing: ['コンピュートの同時 drain ノード数'] });
    } else if (placementAt && placementAt.ok) {
      const reserve = drain * placementAt.maxNodeMemMiB;
      evalItems.push({
        id: `${P}.scDrain`,
        label: `ライブマイグレーション用の予備メモリ（同時 drain ${fmt(drain)} 台）`,
        kind: 'derived',
        status: placementAt.freeMemMiB + 1e-6 >= reserve ? (special ? 'individual' : 'ok') : 'ng',
        value: reserve,
        unit: 'mib',
        text: `必要 ／ クラスタの空き ${fmtMiB(placementAt.freeMemMiB)}`,
        formula: '同時 drain 最大ノード数 × 1 ノードに載る VM メモリ要求量の最大合計（平常時の想定配置から算出）',
        basis: [b('同時 drain ノード数', fmt(drain)), b('ノードごとの VM メモリ合計の最大', fmtMiB(placementAt.maxNodeMemMiB))],
        refs: ['migrationReserve'],
        note: 'クラスタの同時 VM 移行件数は drain ノード数として使わない',
      });
    } else {
      evalItems.push({ id: `${P}.scDrain`, label: 'ライブマイグレーション用の予備メモリ', kind: 'derived', status: 'not_calculated', refs: ['migrationReserve'], missing: ['平常時の配置結果'] });
    }
    if (candidate !== null) {
      const sts = evalItems.filter((i) => i.id.startsWith(`${P}.sc`) || i.id === `${P}.candMin`).map((i) => i.status);
      candidateStatus = sts.includes('ng') ? 'ng' : sts.includes('not_calculated') ? 'not_calculated' : sts.includes('individual') ? 'individual' : sts.includes('unconfirmed') ? 'unconfirmed' : 'ok';
    }
  } else {
    evalItems.push({ id: `${P}.scNormal`, label: '平常時の配置', kind: 'derived', status: 'not_calculated', missing: ['候補台数、または必要台数を求める入力'] });
  }

  // ピーク CPU
  if (totals.peak !== null && vmCpu !== null && evaluated !== null) {
    const capTotal = vmCpu * evaluated - extrasCpu;
    evalItems.push({
      id: `${P}.peakCheck`,
      label: 'ピーク処理に必要な CPU と VM 用 CPU 合計',
      kind: 'derived',
      status: totals.peak <= capTotal ? 'ok' : 'ng',
      text: `ピーク ${fmt(totals.peak)} コア ／ VM 用 CPU 合計 ${fmt(capTotal)} コア（${fmt(evaluated)} 台）`,
      note: 'Pod CPU 要求量とは別の確認。必要台数の計算には含めない',
    });
  } else {
    evalItems.push({ id: `${P}.peakCheck`, label: 'ピーク処理に必要な CPU と VM 用 CPU 合計', kind: 'derived', status: 'unconfirmed', missing: ['ピーク CPU 使用率または実測 CPU', 'ノードの VM 用 CPU'] });
  }

  // 試験上限
  const totalHosts = (evaluated ?? 0) + (has(model.roles.controlPlane.count) ? model.roles.controlPlane.count.v : 0) + (model.infraEnabled && has(model.roles.infra.count) ? model.roles.infra.count.v : 0);
  const limitItems: ResultItem[] = [];
  if (evaluated !== null) {
    limitItems.push({
      id: `${P}.limitHosts`,
      label: 'クラスタのホスト数と試験上限',
      kind: 'official_rec',
      status: totalHosts > off('limitHosts') ? 'individual' : totalHosts > off('limitHostsRecommended') ? 'unconfirmed' : 'ok',
      text: `${fmt(totalHosts)} 台（試験上限 ${off('limitHosts')} 台、推奨 ${off('limitHostsRecommended')} 台以下）`,
      refs: ['limitHosts', 'limitHostsRecommended'],
    });
  }
  if (totals.defined !== null) {
    limitItems.push({
      id: `${P}.limitVms`,
      label: '定義済み VM 数と試験上限',
      kind: 'official_rec',
      status: totals.defined > off('limitDefinedVms') ? 'individual' : 'ok',
      text: `${fmt(totals.defined)} 台（試験上限 ${fmt(off('limitDefinedVms'))} 台）`,
      refs: ['limitDefinedVms'],
    });
  }

  // 配置例の表
  const tables: Table[] = [];
  if (placementAt && placementAt.ok) {
    const maxRows = 40;
    const rows = placementAt.nodes.slice(0, maxRows).map((n, i) => [
      `worker-${i + 1}`,
      Object.entries(n.counts)
        .map(([k, c]) => `${vms.find((v) => v.id === k)?.name ?? k} × ${c}`)
        .join('、') || '（VM なし）',
      `${fmt(n.cpu)} コア`,
      fmtMiB(n.memMiB),
      `${fmt(n.pods)}`,
    ]);
    if (placementAt.nodes.length > maxRows) rows.push([`ほか ${placementAt.nodes.length - maxRows} 台`, '（省略）', '', '', '']);
    tables.push({
      caption: `配置例（${fmt(evaluated ?? 0)} 台、このアプリの簡易配置）`,
      columns: ['ノード', 'VM の内訳', 'CPU 要求量', 'メモリ要求量', 'VM 数'],
      rows,
    });
  }

  const nodeItems: ResultItem[] = [
    ...installMinItems(role, P, { cpu: 'installComputeCpu', ram: 'installComputeRam', disk: 'installComputeDisk', iops: 'installComputeIops' }),
    ...localDiskItems(role, P),
    {
      id: `${P}.rhcos`,
      label: 'OS 要件',
      kind: 'official_min',
      status: 'info',
      text: 'VM をホストする Worker は RHCOS（RHEL Worker は非対応）',
      refs: ['rhcos'],
    },
  ];

  const sections: Section[] = [
    { id: 'compute-node', title: '候補ノードとインストール要件', items: nodeItems },
    { id: 'compute-capacity', title: 'ノードの利用可能容量（1 台あたり）', items: capItems },
    { id: 'compute-demand', title: 'クラスタ全体の需要', items: [...totals.items.filter((i) => ['vmTotal.cpuReq', 'vmTotal.mem', 'vmTotal.running'].includes(i.id)).map((i) => ({ ...i, id: `${P}.${i.id}` })), ...demandItems] },
    { id: 'compute-count', title: '必要台数', items: countItems },
    { id: 'compute-eval', title: '配置と可用性の評価', items: [...evalItems, ...limitItems], tables },
  ];

  return {
    sections,
    vmCpuPerNode: vmCpu,
    vmMemPerNodeMiB: vmMem,
    allocCpu: alloc.cpu,
    allocMemMiB: alloc.memMiB,
    required,
    requiredStatus,
    candidate,
    evaluatedCount: evaluated,
    placementAtEvaluated: placementAt,
    maxNodeMemMiB: placementAt && placementAt.ok ? placementAt.maxNodeMemMiB : null,
    reserveMiB: placementAt && placementAt.ok && drain !== null ? drain * placementAt.maxNodeMemMiB : null,
    totalCpuDemand: totalCpu,
    totalMemDemandMiB: totalMem,
    extrasCpu,
    extrasMemMiB: extrasMem,
    placementStatus,
    candidateStatus,
    items: [...nodeItems, ...capItems, ...demandItems, ...countItems, ...evalItems, ...limitItems],
  };
}
