// サンプル案件（すべてサンプル値。公式値ではない）。
import { emptyBackend, emptyInput, emptyService, emptyVm, type SizingInput, type VmProfileInput } from './types';

function vm(id: string, p: Partial<VmProfileInput>): VmProfileInput {
  return { ...emptyVm(id), ...p };
}

export function sampleInput(): SizingInput {
  const x = emptyInput();
  x.isSample = true;
  x.cluster = {
    ...x.cluster,
    projectName: 'サンプル案件：仮想化基盤の移行',
    platform: 'オンプレミスのベアメタル',
    platformNote: 'x86_64 サーバー（サンプル）',
    namespaces: '120',
    operatorNotes: 'OpenShift Virtualization、MTV、ロギング、監視の追加設定（サンプル）',
  };
  const backend = { ...emptyBackend('sb-a'), name: 'ストレージ A（ブロック、RWX 対応）' };
  backend.factor = '2';
  backend.snapshotGrowth = { raw: '2', unit: 'TiB' };
  backend.freePct = '20';
  backend.specReadIops = '100000';
  backend.specWriteIops = '50000';
  backend.specReadTp = { raw: '2000', unit: 'MiB/s' };
  backend.specWriteTp = { raw: '1000', unit: 'MiB/s' };
  backend.measuredLatencyMs = '1.5';
  x.backends = [backend];

  x.vms = [
    vm('vm-web', {
      name: 'Web サーバー', definedCount: '40', runningCount: '30', runningLinked: false, vcpu: '2', ram: { raw: '4', unit: 'GiB' }, disk: { raw: '60', unit: 'GiB' },
      allocationRatio: '4', peakCpu: '40', backendId: 'sb-a', rwx: 'yes', readIops: '200', writeIops: '100', readTp: { raw: '5', unit: 'MiB/s' }, writeTp: { raw: '3', unit: 'MiB/s' }, latencyMs: '10',
      txBw: { raw: '50', unit: 'Mbps' }, rxBw: { raw: '50', unit: 'Mbps' },
    }),
    vm('vm-app', {
      name: 'アプリケーション', definedCount: '20', runningCount: '20', vcpu: '4', ram: { raw: '16', unit: 'GiB' }, disk: { raw: '120', unit: 'GiB' },
      allocationRatio: '4', peakCpu: '50', backendId: 'sb-a', rwx: 'yes', readIops: '500', writeIops: '300', readTp: { raw: '20', unit: 'MiB/s' }, writeTp: { raw: '10', unit: 'MiB/s' }, latencyMs: '5',
      txBw: { raw: '100', unit: 'Mbps' }, rxBw: { raw: '100', unit: 'Mbps' },
    }),
    vm('vm-db', {
      name: 'データベース', definedCount: '6', runningCount: '6', vcpu: '8', ram: { raw: '64', unit: 'GiB' }, disk: { raw: '500', unit: 'GiB' }, cpuMode: 'dedicated',
      peakCpu: '70', backendId: 'sb-a', rwx: 'yes', readIops: '3000', writeIops: '2000', readTp: { raw: '100', unit: 'MiB/s' }, writeTp: { raw: '80', unit: 'MiB/s' }, latencyMs: '2',
      txBw: { raw: '300', unit: 'Mbps' }, rxBw: { raw: '300', unit: 'Mbps' },
    }),
    vm('vm-win', {
      name: 'Windows 業務端末', definedCount: '10', runningCount: '8', runningLinked: false, vcpu: '4', ram: { raw: '8', unit: 'GiB' }, disk: { raw: '80', unit: 'GiB' },
      allocationRatio: '4', peakCpu: '30', tpm: true, backendId: 'sb-a', rwx: 'yes', readIops: '150', writeIops: '100', readTp: { raw: '5', unit: 'MiB/s' }, writeTp: { raw: '5', unit: 'MiB/s' }, latencyMs: '10',
      txBw: { raw: '20', unit: 'Mbps' }, rxBw: { raw: '20', unit: 'Mbps' },
    }),
  ];
  x.vms[1].runningLinked = true;
  x.vms[2].runningLinked = true;

  const role = (count: string, cpu: string, ramGiB: string, diskGB: string, iops: string, nicGbps: string) => ({
    ...x.roles.compute,
    count,
    cpu,
    ram: { raw: ramGiB, unit: 'GiB' as const },
    disk: { raw: diskGB, unit: 'GB' as const },
    iops,
    nic: { raw: nicGbps, unit: 'Gbps' as const },
    evictionMem: { raw: '100', unit: 'MiB' as const },
    unavailable: '1',
  });
  x.roles.controlPlane = { ...role('3', '16', '64', '240', '5000', '10'), localEstimate: { raw: '120', unit: 'GiB' } };
  x.roles.compute = {
    ...role('6', '64', '512', '480', '50000', '25'),
    localEstimate: { raw: '150', unit: 'GiB' },
    residentCpu: '2',
    residentMem: { raw: '4', unit: 'GiB' },
    podSlots: '200',
  };
  x.roles.infra = { ...role('3', '16', '64', '240', '5000', '10'), localEstimate: { raw: '100', unit: 'GiB' } };
  x.cluster.infraEvenDistribution = true;

  x.cpMetrics = { cpuUtil: '35', memUtil: '45', fsyncMs: '4', rttMs: '2' };

  const mon = { ...emptyService('monitoring', 'svc-mon'), replicas: '2', cpu: '2', mem: { raw: '8', unit: 'GiB' as const }, backendId: 'sb-a', perReplicaPerDay: { raw: '3', unit: 'GiB' as const }, pvFreePct: '20', timeSeries: '1500000', scrapeSec: '30' };
  const ing = { ...emptyService('ingress', 'svc-ing'), replicas: '2', cpu: '1', mem: { raw: '2', unit: 'GiB' as const }, peakBw: { raw: '2000', unit: 'Mbps' as const }, requestRate: '約 3,000 req/s（サンプル）' };
  const reg = { ...emptyService('registry', 'svc-reg'), replicas: '2', cpu: '0.5', mem: { raw: '1', unit: 'GiB' as const }, backendId: 'sb-a', capacity: { raw: '500', unit: 'GiB' as const }, pvFreePct: '20' };
  const log = { ...emptyService('logging', 'svc-log'), replicas: '3', cpu: '2', mem: { raw: '8', unit: 'GiB' as const }, backendId: 'sb-a', capacity: { raw: '2', unit: 'TiB' as const }, pvFreePct: '20' };
  x.services = [mon, ing, reg, log];

  x.availability = {
    ...x.availability,
    computeDrain: '1',
    migrationTargetSec: '900',
    dirtyRate: { raw: '50', unit: 'MiB/s' },
    cpuModelCompatible: 'yes',
  };

  x.paths = x.paths.map((p) => {
    switch (p.key) {
      case 'management':
        return { ...p, nic: 'bond0', clusterTx: { raw: '1000', unit: 'Mbps' }, clusterRx: { raw: '1000', unit: 'Mbps' }, perNodeTx: { raw: '100', unit: 'Mbps' }, perNodeRx: { raw: '100', unit: 'Mbps' } };
      case 'guest':
        return { ...p, nic: 'bond1', perNodeTx: { raw: '3', unit: 'Gbps' }, perNodeRx: { raw: '3', unit: 'Gbps' } };
      case 'ingress':
        return { ...p, nic: 'bond0', clusterTx: { raw: '2000', unit: 'Mbps' }, clusterRx: { raw: '2000', unit: 'Mbps' } };
      case 'storage':
        return { ...p, nic: 'ens-stor', dedicated: true, clusterTx: { raw: '8', unit: 'Gbps' }, clusterRx: { raw: '8', unit: 'Gbps' }, perNodeTx: { raw: '3', unit: 'Gbps' }, perNodeRx: { raw: '3', unit: 'Gbps' } };
      case 'backup':
        return { ...p, nic: 'bond1', clusterTx: { raw: '2000', unit: 'Mbps' }, clusterRx: { raw: '500', unit: 'Mbps' }, perNodeTx: { raw: '400', unit: 'Mbps' }, perNodeRx: { raw: '100', unit: 'Mbps' } };
      case 'migration':
        return { ...p, nic: 'ens-mig', dedicated: true, perNodeTx: { raw: '10', unit: 'Gbps' }, perNodeRx: { raw: '10', unit: 'Gbps' } };
    }
  });
  return x;
}

/** 複数ページになる大きめのサンプル（帳票確認用） */
export function largeSampleInput(): SizingInput {
  const x = sampleInput();
  x.cluster.projectName = 'サンプル案件：大規模（帳票の複数ページ確認用）';
  const extra: VmProfileInput[] = [];
  const names = ['ファイルサーバー', 'メールゲートウェイ', 'CI ランナー', '分析バッチ', 'キャッシュ', 'メッセージング', '認証基盤', 'ジャンプホスト', 'レポーティング', '検証環境', 'ログ集約', 'API ゲートウェイ'];
  names.forEach((name, i) => {
    extra.push(
      vm(`vm-x${i}`, {
        name,
        definedCount: String(4 + i * 2),
        runningCount: String(3 + i),
        runningLinked: false,
        vcpu: String([2, 4, 8][i % 3]),
        ram: { raw: String([4, 8, 16, 32][i % 4]), unit: 'GiB' },
        disk: { raw: String(50 + i * 20), unit: 'GiB' },
        allocationRatio: '4',
        peakCpu: String(30 + (i % 5) * 10),
        backendId: 'sb-a',
        rwx: i % 5 === 4 ? 'unknown' : 'yes',
        readIops: String(100 + i * 50),
        writeIops: String(50 + i * 30),
        readTp: { raw: String(5 + i), unit: 'MiB/s' },
        writeTp: { raw: String(3 + i), unit: 'MiB/s' },
        latencyMs: '10',
        txBw: { raw: String(20 + i * 5), unit: 'Mbps' },
        rxBw: { raw: String(20 + i * 5), unit: 'Mbps' },
      }),
    );
  });
  x.vms = [...x.vms, ...extra];
  x.roles.compute = { ...x.roles.compute, count: '10' };
  return x;
}
