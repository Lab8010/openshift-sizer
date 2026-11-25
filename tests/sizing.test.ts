import { describe, expect, it } from 'vitest';
import { calculateSizing } from '../src/domain/calc';
import { autoSystemReservedCpu, autoSystemReservedMemMiB } from '../src/domain/calc/nodes';
import { vmMemOverheadMiB } from '../src/domain/calc/vm';
import { buildExport, parseImport } from '../src/domain/jsonio';
import type { ResultItem, SizingResult } from '../src/domain/result';
import { largeSampleInput, sampleInput } from '../src/domain/sample';
import { CP_SCALE_ROWS, OFFICIAL, SOURCES, isKnownRef } from '../src/domain/sources';
import { emptyBackend, emptyInput, emptyVm, type SizingInput, type VmProfileInput } from '../src/domain/types';
import { GiB, bytesTo, capacityToBytes, memoryToMiB } from '../src/domain/units';

const NOW = new Date('2026-11-25T00:00:00Z');

function allItems(r: SizingResult): ResultItem[] {
  return r.groups.flatMap((g) => g.sections.flatMap((s) => s.items));
}
function item(r: SizingResult, id: string): ResultItem {
  const found = allItems(r).find((i) => i.id === id);
  if (!found) throw new Error(`item ${id} not found`);
  return found;
}
function vm(p: Partial<VmProfileInput>): VmProfileInput {
  return { ...emptyVm(p.id ?? 'v1'), ...p };
}
/** コンピュートの計算に必要な項目をそろえた最小入力 */
function computeInput(vms: VmProfileInput[], opts: { count?: string; cpu?: string; ramGiB?: string; unavailable?: string } = {}): SizingInput {
  const x = emptyInput();
  x.vms = vms;
  x.cluster.namespaces = '50';
  x.roles.compute = {
    ...x.roles.compute,
    count: opts.count ?? '',
    allocCpu: opts.cpu ?? '32',
    allocMem: { raw: opts.ramGiB ?? '256', unit: 'GiB' },
    residentCpu: '0',
    residentMem: { raw: '0', unit: 'GiB' },
    residentIncludesVirt: true,
    unavailable: opts.unavailable ?? '',
  };
  return x;
}

describe('VM メモリ', () => {
  it('4 vCPU・8 GiB・グラフィックス 1 で追加分 282.384 MiB、合計 8474.384 MiB', () => {
    const overhead = vmMemOverheadMiB({ ramMiB: 8192, vcpu: 4, graphics: 1, sriov: 0, gpu: 0, sev: false, tpm: false });
    expect(overhead).toBeCloseTo(282.384, 9);
    const x = emptyInput();
    x.vms = [vm({ name: 'A', definedCount: '1', vcpu: '4', ram: { raw: '8', unit: 'GiB' }, graphics: '1' })];
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'vm.v1.memOverhead').value).toBeCloseTo(282.384, 9);
    expect(item(result, 'vm.v1.memPerVm').value).toBeCloseTo(8474.384, 9);
  });

  it('SR-IOV・GPU・SEV・TPM の追加分を加算する', () => {
    const o = vmMemOverheadMiB({ ramMiB: 1024, vcpu: 2, graphics: 0, sriov: 1, gpu: 1, sev: true, tpm: true });
    expect(o).toBeCloseTo(0.002 * 1024 + 218 + 16 + 2048 + 256 + 53, 9);
  });
});

describe('CPU の計算', () => {
  it('専用 CPU は 1 対 1、共有 CPU は vCPU ÷ 比率', () => {
    const x = emptyInput();
    x.vms = [
      vm({ id: 'd', name: '専用', definedCount: '2', vcpu: '4', ram: { raw: '4', unit: 'GiB' }, cpuMode: 'dedicated' }),
      vm({ id: 's', name: '共有', definedCount: '2', vcpu: '4', ram: { raw: '4', unit: 'GiB' }, allocationRatio: '10' }),
    ];
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'vm.d.cpuReq').value).toBe(4);
    expect(item(result, 'vm.s.cpuReq').value).toBeCloseTo(0.4, 12);
    expect(item(result, 'vmTotal.cpuReq').value).toBeCloseTo(8.8, 12);
  });

  it('比率が未入力の共有 CPU は未算出。1 対 1 を明示選択したときだけ計画値を出す', () => {
    const x = emptyInput();
    x.vms = [vm({ name: '共有', definedCount: '3', vcpu: '2', ram: { raw: '4', unit: 'GiB' } })];
    let r = calculateSizing(x, NOW).result;
    expect(item(r, 'vm.v1.cpuReq').status).toBe('not_calculated');
    expect(item(r, 'vmTotal.vcpu').value).toBe(6);
    x.cluster.plan1to1 = true;
    r = calculateSizing(x, NOW).result;
    expect(item(r, 'vm.v1.cpuReq').value).toBe(2);
    expect(item(r, 'vm.v1.cpuReq').kind).toBe('assumption');
  });
});

describe('単位と台数', () => {
  it('100 GB ≈ 93.132 GiB', () => {
    expect(bytesTo(capacityToBytes(100, 'GB'), 'GiB')).toBeCloseTo(93.1322574615, 9);
    expect(memoryToMiB(1, 'GiB')).toBe(1024);
  });

  it('永続ディスクは定義台数、CPU・メモリは最大同時稼働台数で集計する', () => {
    const x = emptyInput();
    x.vms = [
      vm({ id: 'a', name: 'A', definedCount: '10', runningCount: '4', runningLinked: false, vcpu: '2', ram: { raw: '4', unit: 'GiB' }, disk: { raw: '100', unit: 'GB' }, cpuMode: 'dedicated' }),
      vm({ id: 'b', name: 'B', definedCount: '5', runningCount: '5', runningLinked: false, vcpu: '4', ram: { raw: '8', unit: 'GiB' }, disk: { raw: '50', unit: 'GiB' }, cpuMode: 'dedicated' }),
    ];
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'vmTotal.disk').value).toBeCloseTo(10 * 100e9 + 5 * 50 * GiB, 3);
    expect(item(result, 'vmTotal.vcpu').value).toBe(4 * 2 + 5 * 4);
    expect(item(result, 'vmTotal.cpuReq').value).toBe(28);
    const memA = 4096 + vmMemOverheadMiB({ ramMiB: 4096, vcpu: 2, graphics: 1, sriov: 0, gpu: 0, sev: false, tpm: false });
    const memB = 8192 + vmMemOverheadMiB({ ramMiB: 8192, vcpu: 4, graphics: 1, sriov: 0, gpu: 0, sev: false, tpm: false });
    expect(item(result, 'vmTotal.mem').value).toBeCloseTo(4 * memA + 5 * memB, 9);
  });

  it('最大同時稼働台数の初期値は定義台数と同数で、前提として表示する', () => {
    const x = emptyInput();
    x.vms = [vm({ name: 'A', definedCount: '7', vcpu: '1', ram: { raw: '1', unit: 'GiB' } })];
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'vm.v1.running').value).toBe(7);
    expect(item(result, 'vm.v1.running').kind).toBe('assumption');
    expect(result.assumptions.some((a) => a.text.includes('定義台数と同数'))).toBe(true);
  });
});

describe('入力の検証', () => {
  it('最大同時稼働台数が定義台数を超える、負値、整数でない、無効な比率をエラーにする', () => {
    const x = emptyInput();
    x.vms = [vm({ name: 'A', definedCount: '3', runningCount: '5', runningLinked: false, vcpu: '-1', ram: { raw: '1.5', unit: 'GiB' }, allocationRatio: '0' })];
    x.roles.compute.count = '2.5';
    const { errors } = calculateSizing(x, NOW);
    const msgs = errors.map((e) => e.message).join('\n');
    expect(msgs).toContain('定義台数（3）を超えています');
    expect(msgs).toContain('負の値');
    expect(msgs).toContain('CPU 割り当て比率は 0 より大きい');
    expect(msgs).toContain('整数で入力');
  });

  it('既知の 0、未入力、対象外を区別する', () => {
    const x = emptyInput();
    x.vms = [
      vm({ id: 'z', name: 'Z', definedCount: '1', vcpu: '1', ram: { raw: '1', unit: 'GiB' }, disk: { raw: '0', unit: 'GiB' } }),
      vm({ id: 'e', name: 'E', definedCount: '1', vcpu: '1', ram: { raw: '1', unit: 'GiB' } }),
      vm({ id: 'n', name: 'N', definedCount: '1', vcpu: '1', ram: { raw: '1', unit: 'GiB' }, disk: { raw: '対象外', unit: 'GiB' } }),
    ];
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'vm.z.diskTotal').value).toBe(0);
    expect(item(result, 'vm.z.diskTotal').status).toBe('calculated');
    expect(item(result, 'vm.e.diskTotal').status).toBe('not_calculated');
    expect(item(result, 'vm.n.diskTotal').status).toBe('na');
  });
});

describe('ノード負荷と公式試験条件', () => {
  it('インフラの 4 コア・2,179 MiB はクラスタ全体で一度だけ加算する', () => {
    for (const count of ['3', '5']) {
      const x = sampleInput();
      x.roles.infra.count = count;
      const { result } = calculateSizing(x, NOW);
      expect(item(result, 'infra.virtCpu').value).toBe(4);
      expect(item(result, 'infra.virtMemTotal').value).toBe(2179);
      expect(item(result, 'infra.virtMemSum').value).toBe(2179 + 150 * Number(count));
    }
    // インフラノードなし：コンピュートへ一度だけ計上
    const x = computeInput([vm({ name: 'A', definedCount: '1', vcpu: '2', ram: { raw: '4', unit: 'GiB' }, cpuMode: 'dedicated' })]);
    x.cluster.infraEnabled = false;
    x.services = [];
    const { result } = calculateSizing(x, NOW);
    const total = item(result, 'compute.totalCpu').value as number;
    expect(total).toBe(2 + 4);
    const mem = item(result, 'compute.totalMem').value as number;
    const vmMem = 4096 + vmMemOverheadMiB({ ramMiB: 4096, vcpu: 2, graphics: 1, sriov: 0, gpu: 0, sev: false, tpm: false });
    expect(mem).toBeCloseTo(vmMem + 2179, 9);
  });

  it('Worker ノードの Virtualization 分（2 コア・360 MiB）を 1 台ごとに差し引く', () => {
    const x = computeInput([vm({ name: 'A', definedCount: '1', vcpu: '2', ram: { raw: '4', unit: 'GiB' }, cpuMode: 'dedicated' })]);
    x.roles.compute.residentIncludesVirt = false;
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'compute.vmCpuPerNode').value).toBe(30);
    expect(item(result, 'compute.vmMemPerNode').value).toBe(256 * 1024 - 360);
  });

  it('252 台・4,000 Namespace（OVN-Kubernetes）のコントロールプレーン参照点は 24 コア・128 GB', () => {
    const x = emptyInput();
    x.vms = [vm({ name: 'A', definedCount: '1', vcpu: '1', ram: { raw: '1', unit: 'GiB' } })];
    x.cluster.namespaces = '4000';
    x.cluster.cpWorkerBasis = 'manual';
    x.cluster.cpWorkerManual = '252';
    let r = calculateSizing(x, NOW).result;
    const row = item(r, 'cp.scaleRow');
    expect(row.status).toBe('calculated');
    expect(row.refs).toEqual(['cpScale252Ovn']);
    const cp252 = CP_SCALE_ROWS.find((x) => x.id === 'cpScale252Ovn');
    expect(cp252?.cpuCores).toBe(24);
    expect(cp252?.memoryGB).toBe(128);
    expect(row.text).toContain('24 コア・128 GB');

    // 適用範囲を超える（501 台の行は OVN-Kubernetes 未検証のため使わない）
    x.cluster.cpWorkerManual = '253';
    r = calculateSizing(x, NOW).result;
    expect(item(r, 'cp.scaleRow').status).toBe('individual');
    expect(item(r, 'cp.scaleRow').display).toContain('要個別評価');
    x.cluster.cpWorkerManual = '100';
    x.cluster.namespaces = '4001';
    r = calculateSizing(x, NOW).result;
    expect(item(r, 'cp.scaleRow').status).toBe('individual');
  });

  it('Worker 台数と Namespace 数の両方が収まる最小の行を選ぶ（補間しない）', () => {
    const x = emptyInput();
    x.vms = [vm({ name: 'A', definedCount: '1', vcpu: '1', ram: { raw: '1', unit: 'GiB' } })];
    x.cluster.cpWorkerBasis = 'manual';
    x.cluster.cpWorkerManual = '20';
    x.cluster.namespaces = '800';
    const r = calculateSizing(x, NOW).result;
    expect(item(r, 'cp.scaleRow').refs).toEqual(['cpScale120']);
  });

  it('システム予約の自動計算は公式の例（16 GiB → 2.6 GiB、4 コア → 0.5 コア）と一致する', () => {
    expect(autoSystemReservedMemMiB(16 * 1024) / 1024).toBeCloseTo(2.6, 12);
    expect(autoSystemReservedCpu(4)).toBe(0.5);
    expect(autoSystemReservedCpu(64)).toBeCloseTo(0.06 + 0.012 * 63, 12);
  });
});

describe('障害・未入力', () => {
  it('クラスタ合計が足りていても、最大 VM が残存ノード 1 台に収まらなければ適合としない', () => {
    // VM 用 CPU 32 コア × 3 台 = 96 コア。40 vCPU 専用 CPU の VM は 1 台に収まらない
    const x = computeInput([vm({ name: '大型', definedCount: '1', vcpu: '40', ram: { raw: '64', unit: 'GiB' }, cpuMode: 'dedicated' })], { count: '3', unavailable: '1' });
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'compute.scNormal').status).toBe('ng');
    expect(item(result, 'compute.scFail').status).toBe('ng');
    expect(item(result, 'compute.required').status).toBe('ng');
    expect(result.summary.find((s) => s.role === 'コンピュート')?.count.status).toBe('ng');
  });

  it('停止時に残存ノードへ配置できなければ不適合（合計容量では足りる場合）', () => {
    // 1 台あたり 32 コア。20 コアの VM 2 台は 2 台構成なら配置できるが、1 台停止すると残り 1 台に 2 台は載らない
    const x = computeInput([vm({ name: 'B', definedCount: '2', vcpu: '20', ram: { raw: '16', unit: 'GiB' }, cpuMode: 'dedicated' })], { count: '2', unavailable: '1' });
    const { result } = calculateSizing(x, NOW);
    expect(item(result, 'compute.scNormal').status).toBe('ok');
    expect(item(result, 'compute.scFail').status).toBe('ng');
    expect(item(result, 'compute.required').value).toBe(3);
  });

  it('停止台数と移行用予備メモリを別シナリオとして評価する', () => {
    const x = computeInput([vm({ name: 'C', definedCount: '4', vcpu: '4', ram: { raw: '32', unit: 'GiB' }, cpuMode: 'dedicated' })], { count: '4', unavailable: '1' });
    x.availability.computeDrain = '1';
    const { result } = calculateSizing(x, NOW);
    const drain = item(result, 'compute.scDrain');
    const perVm = 32768 + vmMemOverheadMiB({ ramMiB: 32768, vcpu: 4, graphics: 1, sriov: 0, gpu: 0, sev: false, tpm: false });
    expect(drain.value).toBeCloseTo(perVm, 6); // 1 ノード 1 VM × drain 1
    expect(drain.status).toBe('ok');
    expect(item(result, 'compute.scFail').status).toBe('ok');
  });

  it('未入力の帯域や IOPS は 0 や適合にならない', () => {
    const x = emptyInput();
    const be = { ...emptyBackend('sb'), name: 'S', factor: '1', specReadIops: '1000', specWriteIops: '1000' };
    x.backends = [be];
    x.vms = [vm({ name: 'A', definedCount: '2', vcpu: '2', ram: { raw: '4', unit: 'GiB' }, disk: { raw: '10', unit: 'GiB' }, backendId: 'sb' })];
    const { result } = calculateSizing(x, NOW);
    const r = item(result, 'storage.sb.readIops');
    expect(r.status).toBe('not_calculated');
    expect(r.value).toBeUndefined();
    expect(item(result, 'net.guestVm').status).toBe('not_calculated');
    expect(item(result, 'net.cluster').status).toBe('unconfirmed');
    const nic = allItems(result).filter((i) => i.id.startsWith('net.nic.'));
    expect(nic.every((i) => i.status !== 'ok')).toBe(true);
    // 未入力の実測値は未確認
    expect(item(result, 'cp.fsync').status).toBe('unconfirmed');
    expect(item(result, 'cp.cpuUtil').status).toBe('unconfirmed');
  });

  it('関連する入力を追加すると結果が更新される', () => {
    const x = emptyInput();
    x.backends = [{ ...emptyBackend('sb'), name: 'S', factor: '1', specReadIops: '1000' }];
    x.vms = [vm({ name: 'A', definedCount: '2', vcpu: '2', ram: { raw: '4', unit: 'GiB' }, disk: { raw: '10', unit: 'GiB' }, backendId: 'sb', readIops: '300' })];
    const r = calculateSizing(x, NOW).result;
    expect(item(r, 'storage.sb.readIops').value).toBe(600);
    expect(item(r, 'storage.sb.readIops').status).toBe('ok');
  });
});

describe('出典と出力', () => {
  it('使った公式値・試験行の出典 ID がすべて登録済みで、URL は 4.22 版', () => {
    const { result } = calculateSizing(largeSampleInput(), NOW);
    expect(result.usedRefs.length).toBeGreaterThan(10);
    for (const r of result.usedRefs) expect(isKnownRef(r), r).toBe(true);
    for (const o of Object.values(OFFICIAL)) expect(SOURCES[o.sourceId]).toBeDefined();
    for (const s of Object.values(SOURCES)) expect(s.url).toContain('/4.22/');
  });

  it('サンプルの 3 ロールの結果が日本語で表示される', () => {
    const { result, errors } = calculateSizing(sampleInput(), NOW);
    expect(errors).toEqual([]);
    const roles = result.summary.map((s) => s.role);
    expect(roles).toEqual(expect.arrayContaining(['コントロールプレーン', 'コンピュート', 'インフラ']));
    expect(item(result, 'compute.required').status).toBe('calculated');
    expect(item(result, 'compute.required').value).toBeGreaterThanOrEqual(2);
    expect(item(result, 'vmTotal.vcpu').status).toBe('calculated');
    expect(item(result, 'vmTotal.mem').status).toBe('calculated');
    expect(item(result, 'vmTotal.disk').status).toBe('calculated');
  });

  it('JSON に出力して読み戻すと元の入力を再現し、数値が一致する', () => {
    const input = largeSampleInput();
    const { result } = calculateSizing(input, NOW);
    const file = buildExport(input, result, NOW);
    expect(file.schemaVersion).toBe(1);
    expect(file.product.version).toBe('4.22');
    expect(file.references.map((r) => r.id)).toEqual(Object.keys(SOURCES));
    const text = JSON.stringify(file);
    const back = parseImport(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.input).toEqual(input);
    const again = calculateSizing(back.input, NOW).result;
    expect(JSON.parse(JSON.stringify(again))).toEqual(JSON.parse(JSON.stringify(file.result)));
    // 表示文字列は画面・印刷・JSON で共通（同じ display を使う）
    const a = allItems(again).map((i) => i.display);
    const b = allItems(file.result).map((i) => i.display);
    expect(a).toEqual(b);
  });

  it('不正な JSON・不正な単位・不正な入力値は読み込まない', () => {
    expect(parseImport('{').ok).toBe(false);
    const input = sampleInput();
    const { result } = calculateSizing(input, NOW);
    const file = buildExport(input, result, NOW) as unknown as { input: { vms: { ram: { unit: string }; vcpu: string }[] } };
    const badUnit = structuredClone(file);
    badUnit.input.vms[0].ram.unit = 'GiBB';
    expect(parseImport(JSON.stringify(badUnit)).ok).toBe(false);
    const badValue = structuredClone(file);
    badValue.input.vms[0].vcpu = '-3';
    const r = parseImport(JSON.stringify(badValue));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('負の値');
  });
});
