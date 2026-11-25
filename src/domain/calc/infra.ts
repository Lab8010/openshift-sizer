// インフラノードの計算。
import { has, type SizingModel } from '../parse';
import { fmt, fmtMiB, type ResultItem, type Section, type Status } from '../result';
import { INFRA_SCALE_ROWS, type ScaleRow } from '../sources';
import { GB } from '../units';
import { b, nonEmpty, nvText, off } from './helpers';
import { calcAllocatable } from './nodes';
import { localDiskItems } from './roleChecks';
import { SCALE_RULE, selectScaleRow } from './scale';
import { workerCount } from './controlPlane';
import type { ServicesCalc } from './services';

export interface InfraCalc {
  enabled: boolean;
  sections: Section[];
  row: ScaleRow | null;
  rowStatus: Status;
  count: number | null;
  /** インフラに載る要求量の合計（サービス + Virtualization 分） */
  stackCpu: number | null;
  stackMemMiB: number | null;
  virtCpuTotal: number;
  virtMemTotalMiB: number | null;
  perNodeGuideCpu: number | null;
  perNodeGuideMemMiB: number | null;
  stackStatus: Status;
  items: ResultItem[];
}

export function calcInfra(model: SizingModel, svc: ServicesCalc, computeCount: number | null, computeFrom: string): InfraCalc {
  const P = 'infra';
  const role = model.roles.infra;
  if (!model.infraEnabled) {
    const it: ResultItem = {
      id: `${P}.disabled`,
      label: 'インフラノード',
      kind: 'input',
      status: 'na',
      text: 'インフラノードを使わない構成（インフラ向けサービスと Virtualization のインフラ分はコンピュートへ計上）',
    };
    return {
      enabled: false,
      sections: [{ id: 'infra-off', title: 'インフラノード', items: [it] }],
      row: null,
      rowStatus: 'na',
      count: null,
      stackCpu: null,
      stackMemMiB: null,
      virtCpuTotal: off('virtCpuInfraTotal'),
      virtMemTotalMiB: null,
      perNodeGuideCpu: null,
      perNodeGuideMemMiB: null,
      stackStatus: 'na',
      items: [it],
    };
  }
  const count = has(role.count) ? role.count.v : null;
  const countItems: ResultItem[] = [
    {
      id: `${P}.count`,
      label: 'インフラノードの台数',
      kind: count === null ? 'official_rec' : 'input',
      status: count === null ? 'unconfirmed' : count >= off('infraRecommendedCount') ? 'ok' : 'unconfirmed',
      text: count === null ? `一般推奨 ${off('infraRecommendedCount')} 台（候補台数は未入力）` : `候補 ${fmt(count)} 台 ／ 一般推奨 ${off('infraRecommendedCount')} 台`,
      refs: ['infraRecommendedCount'],
      note: 'インフラノード専用の公式最低要件は汎用インストール表にないため、表からの推定値は表示しない',
      missing: count === null ? ['インフラノードの台数'] : undefined,
    },
  ];

  // 試験表の参考点
  const wc = workerCount(model.infraWorkerBasis, model.infraWorkerManual, computeCount, computeFrom, count);
  const ns = has(model.namespaces) ? model.namespaces.v : null;
  let row: ScaleRow | null = null;
  let rowStatus: Status = 'not_calculated';
  if (wc.value !== null && ns !== null) {
    row = selectScaleRow(INFRA_SCALE_ROWS, wc.value, ns);
    rowStatus = row ? 'calculated' : 'individual';
  }
  const scaleMissing = [...wc.missing, ...(ns === null ? ['Namespace 数'] : [])];
  const scaleItems: ResultItem[] = [
    {
      id: `${P}.scaleRow`,
      label: '試験結果の参考サイズ（1 台あたり）',
      kind: 'official_rec',
      status: rowStatus,
      text: row
        ? `${row.cpuCores} コア・${row.memoryGB} GB（試験条件：Worker ${row.nodes} 台、${fmt(row.namespaces)} Namespace）`
        : rowStatus === 'individual'
          ? '公式試験の適用範囲（501 台・4,000 Namespace）を超えるため要個別評価'
          : undefined,
      basis: [b('比較に使う Worker 台数', wc.text), b('Namespace 数', nvText(model.namespaces))],
      refs: row ? [row.id, 'infraScope'] : ['infraScale27', 'infraScale120', 'infraScale252', 'infraScale501', 'infraScope'],
      note: `${SCALE_RULE}。監視スタックとデフォルト Ingress Controller をインフラノードへ移した試験の値。監視・標準 Ingress の要求量はこの参考サイズに含まれるため重複加算しない`,
      missing: scaleMissing.length ? scaleMissing : undefined,
    },
  ];
  if (row) {
    const memGB = has(role.ramMiB) ? (role.ramMiB.v * 2 ** 20) / GB : null;
    const cpuSt: Status = has(role.cpu) ? (role.cpu.v >= row.cpuCores ? 'ok' : 'ng') : 'unconfirmed';
    const memSt: Status = memGB !== null ? (memGB >= row.memoryGB ? 'ok' : 'ng') : 'unconfirmed';
    scaleItems.push({
      id: `${P}.candVsRow`,
      label: '候補ノードと試験の参考サイズ',
      kind: 'derived',
      status: cpuSt === 'ng' || memSt === 'ng' ? 'ng' : cpuSt === 'ok' && memSt === 'ok' ? 'ok' : 'unconfirmed',
      text: `CPU 候補 ${nvText(role.cpu)} ／ 参考 ${row.cpuCores} コア、メモリ候補 ${memGB !== null ? `${fmt(memGB)} GB` : '未入力'} ／ 参考 ${row.memoryGB} GB`,
      refs: [row.id],
      missing: cpuSt === 'unconfirmed' || memSt === 'unconfirmed' ? ['インフラ候補ノードの CPU・メモリ'] : undefined,
    });
  }

  // Virtualization の追加負荷
  const virtCpuTotal = off('virtCpuInfraTotal');
  const virtMemTotal = count !== null ? off('virtMemInfraTotal') + off('virtMemPerInfraNode') * count : null;
  const virtItems: ResultItem[] = [
    {
      id: `${P}.virtCpu`,
      label: 'Virtualization の CPU 追加分（インフラノード群全体）',
      kind: 'official_default',
      status: 'calculated',
      value: virtCpuTotal,
      unit: 'cores',
      text: '（ノード数を掛けない）',
      refs: ['virtCpuInfraTotal'],
      note: count ? `均等配分する計画なら 1 台あたり約 ${fmt(virtCpuTotal / count)} コア（概算）` : undefined,
    },
    {
      id: `${P}.virtMemTotal`,
      label: 'Virtualization のメモリ追加分（インフラノード群全体）',
      kind: 'official_default',
      status: 'calculated',
      value: off('virtMemInfraTotal'),
      unit: 'mib',
      text: '（ノード数を掛けない）',
      refs: ['virtMemInfraTotal'],
    },
    {
      id: `${P}.virtMemNode`,
      label: 'Virtualization のメモリ追加分（インフラノード 1 台あたり）',
      kind: 'official_default',
      status: 'calculated',
      value: off('virtMemPerInfraNode'),
      unit: 'mib',
      refs: ['virtMemPerInfraNode'],
    },
    {
      id: `${P}.virtMemSum`,
      label: 'Virtualization のメモリ追加分（合計）',
      kind: 'derived',
      status: virtMemTotal === null ? 'not_calculated' : 'calculated',
      value: virtMemTotal ?? undefined,
      unit: 'mib',
      formula: '2,179 MiB（全体で 1 回） + 150 MiB × インフラノード台数',
      refs: ['virtMemInfraTotal', 'virtMemPerInfraNode'],
      missing: virtMemTotal === null ? ['インフラノードの台数'] : undefined,
    },
  ];

  // サービス別の積み上げ
  const onInfra = svc.byPlacement.infra;
  const add = svc.additionalOnInfra;
  const stackKnown = onInfra.missing.length === 0 && virtMemTotal !== null;
  const stackCpu = onInfra.missing.length === 0 ? onInfra.cpu + virtCpuTotal : null;
  const stackMem = stackKnown ? onInfra.memMiB + (virtMemTotal as number) : null;
  const alloc = calcAllocatable(role, P, 'インフラ');
  const stackItems: ResultItem[] = [
    {
      id: `${P}.svcTotal`,
      label: 'インフラに配置するサービスの要求量（合計）',
      kind: 'derived',
      status: onInfra.missing.length ? 'not_calculated' : onInfra.services.length ? 'calculated' : 'na',
      text: onInfra.services.length ? `CPU ${fmt(onInfra.cpu)} コア、メモリ ${fmtMiB(onInfra.memMiB)}（${onInfra.services.join('、')}）` : 'インフラに配置するサービスなし',
      missing: onInfra.missing.length ? onInfra.missing.map((n) => `${n} の要求量`) : undefined,
    },
    {
      id: `${P}.additional`,
      label: '公式試験に含まれない追加サービス（独立した要求量）',
      kind: 'derived',
      status: add.missing.length ? 'not_calculated' : add.services.length ? 'calculated' : 'na',
      text: add.services.length ? `CPU ${fmt(add.cpu)} コア、メモリ ${fmtMiB(add.memMiB)}（${add.services.join('、')}）` : '追加サービスなし',
      missing: add.missing.length ? add.missing.map((n) => `${n} の要求量`) : undefined,
    },
    ...alloc.items,
  ];
  let stackStatus: Status = 'not_calculated';
  const u = has(role.unavailable) ? role.unavailable.v : null;
  if (stackCpu !== null && stackMem !== null && alloc.cpu !== null && alloc.memMiB !== null && count !== null) {
    const capCpu = alloc.cpu * count;
    const capMem = alloc.memMiB * count;
    const ok = stackCpu <= capCpu && stackMem <= capMem;
    stackStatus = ok ? (model.infraEvenDistribution ? 'ok' : 'unconfirmed') : 'ng';
    stackItems.push({
      id: `${P}.stackFit`,
      label: 'サービス積み上げとインフラ合計容量（平常時）',
      kind: 'derived',
      status: stackStatus,
      text: `需要 CPU ${fmt(stackCpu)} コア・メモリ ${fmtMiB(stackMem)} ／ Allocatable 合計 CPU ${fmt(capCpu)} コア・メモリ ${fmtMiB(capMem)}（${fmt(count)} 台）`,
      formula: 'Σ(インフラに配置するサービスの要求量) + Virtualization の追加分 ≤ 台数 × Allocatable',
      note: model.infraEvenDistribution ? 'ノードへ均等配分する計画として判定（1 台あたりは概算）' : '実際の配置が未確認のため、合計値だけでは適合と判定しない（均等配分の計画なら入力画面で選択）',
    });
    if (u === null) {
      stackItems.push({ id: `${P}.stackFail`, label: 'インフラの停止時容量', kind: 'derived', status: 'unconfirmed', missing: ['インフラの利用できないノード数'] });
    } else {
      const rest = count - u;
      const okF = rest >= 1 && stackCpu <= alloc.cpu * rest && stackMem <= alloc.memMiB * rest;
      stackItems.push({
        id: `${P}.stackFail`,
        label: `インフラの停止時容量（${fmt(u)} 台停止、残り ${fmt(Math.max(rest, 0))} 台）`,
        kind: 'derived',
        status: !okF ? 'ng' : model.infraEvenDistribution ? 'ok' : 'unconfirmed',
        text: rest >= 1 ? `Allocatable 合計 CPU ${fmt(alloc.cpu * rest)} コア・メモリ ${fmtMiB(alloc.memMiB * rest)}` : '残存ノードがありません',
      });
    }
  } else {
    stackItems.push({
      id: `${P}.stackFit`,
      label: 'サービス積み上げとインフラ合計容量（平常時）',
      kind: 'derived',
      status: 'not_calculated',
      missing: nonEmpty([
        ...(onInfra.missing.length ? onInfra.missing.map((n) => `${n} の要求量`) : []),
        ...(count === null ? ['インフラノードの台数'] : []),
        ...alloc.missingCpu,
        ...alloc.missingMem,
      ]),
    });
  }

  // 1 台あたりの目安（均等配分の計画時のみ）
  let guideCpu: number | null = null;
  let guideMem: number | null = null;
  if (model.infraEvenDistribution) {
    if (row && count && add.missing.length === 0) {
      guideCpu = row.cpuCores + virtCpuTotal / count + add.cpu / count;
      guideMem = (row.memoryGB * GB) / 2 ** 20 + off('virtMemInfraTotal') / count + off('virtMemPerInfraNode') + add.memMiB / count;
    }
    const memGiBCand = has(role.ramMiB) ? role.ramMiB.v : null;
    stackItems.push({
      id: `${P}.perNodeGuide`,
      label: '1 台あたりの目安（試験参考サイズ + Virtualization 分 + 追加サービス、均等配分の概算）',
      kind: 'derived',
      status:
        guideCpu === null || guideMem === null
          ? rowStatus === 'individual'
            ? 'individual'
            : 'not_calculated'
          : has(role.cpu) && memGiBCand !== null
            ? role.cpu.v >= guideCpu && memGiBCand >= guideMem
              ? 'ok'
              : 'ng'
            : 'calculated',
      text: guideCpu !== null && guideMem !== null ? `CPU ${fmt(guideCpu)} コア、メモリ ${fmtMiB(guideMem)}（候補 CPU ${nvText(role.cpu)}、メモリ ${has(role.ramMiB) ? fmtMiB(role.ramMiB.v) : '未入力'}）` : undefined,
      formula: '参考サイズ + (4 コア + 追加サービス CPU) ÷ 台数、参考メモリ + (2,179 MiB + 追加サービスメモリ) ÷ 台数 + 150 MiB',
      note: 'このアプリの仮定：均等配分。監視・標準 Ingress（・Registry）の要求量は参考サイズに含まれるため加算しない。候補ノードの容量と比較（システム予約は別途）',
      refs: ['virtCpuInfraTotal', 'virtMemInfraTotal', 'virtMemPerInfraNode', ...(row ? [row.id] : [])],
      missing: guideCpu === null && rowStatus !== 'individual' ? ['試験の参考点（Worker 台数・Namespace 数）', 'インフラノードの台数', '追加サービスの要求量'] : undefined,
    });
  } else {
    stackItems.push({
      id: `${P}.perNodeGuide`,
      label: '1 台あたりの配置',
      kind: 'derived',
      status: 'unconfirmed',
      text: 'サービスのノードごとの配置が未確認（均等配分の計画であれば入力画面で選択すると 1 台あたりの概算を表示）',
    });
  }

  const sections: Section[] = [
    { id: 'infra-count', title: '台数', items: countItems },
    { id: 'infra-scale', title: '公式試験の参考サイズ', items: scaleItems },
    { id: 'infra-virt', title: 'Virtualization の追加負荷', items: virtItems },
    { id: 'infra-stack', title: 'サービス別の積み上げと容量', items: stackItems },
    { id: 'infra-disk', title: 'ローカルディスク', items: localDiskItems(role, P) },
  ];
  return {
    enabled: true,
    sections,
    row,
    rowStatus,
    count,
    stackCpu,
    stackMemMiB: stackMem,
    virtCpuTotal,
    virtMemTotalMiB: virtMemTotal,
    perNodeGuideCpu: guideCpu,
    perNodeGuideMemMiB: guideMem,
    stackStatus,
    items: sections.flatMap((s) => s.items),
  };
}
