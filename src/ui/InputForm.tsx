import { Fragment } from 'react';
import {
  PATH_LABELS,
  PLACEMENT_LABELS,
  PLATFORMS,
  SERVICE_LABELS,
  emptyBackend,
  emptyService,
  emptyVm,
  newId,
  type Placement,
  type RoleKey,
  type SizingInput,
  type VmProfileInput,
  type WorkerBasis,
} from '../domain/types';
import { BANDWIDTH_UNITS, CAPACITY_UNITS, MEMORY_UNITS, THROUGHPUT_UNITS } from '../domain/units';
import { CheckField, NumField, QtyField, SelectField, TextField, TRI_OPTIONS } from './fields';
import { RefLink } from './common';

export type Update = (fn: (d: SizingInput) => void) => void;

export function InputForm({ input, update }: { input: SizingInput; update: Update }) {
  return (
    <div className="input-form">
      <p className="lead">
        <strong>ゲスト VM のスペック</strong>（OpenShift Virtualization 上で動かす仮想マシン）と、<strong>OpenShift ノードのスペック</strong>
        （VM を載せる物理サーバー等）を分けて入力します。空欄は「未入力」として扱い、0 や既定値に置き換えません。該当しない項目は「対象外」と入力できます。
      </p>
      <ClusterSection input={input} update={update} />
      <VmSection input={input} update={update} />
      <RolesSection input={input} update={update} />
      <CpMetricsSection input={input} update={update} />
      <ServicesSection input={input} update={update} />
      <AvailabilitySection input={input} update={update} />
      <NetworkSection input={input} update={update} />
      <BackendsSection input={input} update={update} />
    </div>
  );
}

function Card({ id, title, children, kind }: { id: string; title: string; children: React.ReactNode; kind?: 'guest' | 'node' }) {
  return (
    <section className={`card ${kind ? `card-${kind}` : ''}`} aria-labelledby={`${id}-h`} id={id}>
      <h2 id={`${id}-h`}>
        {kind && <span className={`tag tag-${kind}`}>{kind === 'guest' ? 'ゲスト VM' : 'OpenShift ノード'}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ClusterSection({ input, update }: { input: SizingInput; update: Update }) {
  const c = input.cluster;
  const basisOptions: { value: WorkerBasis; label: string }[] = [
    { value: 'compute', label: 'コンピュート台数' },
    { value: 'computePlusInfra', label: 'コンピュート + インフラ台数' },
    { value: 'manual', label: '手入力' },
  ];
  return (
    <Card id="in-cluster" title="案件とクラスタ">
      <div className="grid">
        <TextField path="cluster.projectName" label="案件名" value={c.projectName} onChange={(v) => update((d) => void (d.cluster.projectName = v))} />
        <SelectField
          path="cluster.platform"
          label="配置プラットフォーム"
          value={c.platform}
          options={PLATFORMS.map((p) => ({ value: p, label: p }))}
          onChange={(v) => update((d) => void (d.cluster.platform = v))}
          hint={
            <>
              記録のみ。対応可否は <RefLink refKey="platforms" /> で確認
            </>
          }
        />
        <TextField path="cluster.platformNote" label="プラットフォームの補足" value={c.platformNote} onChange={(v) => update((d) => void (d.cluster.platformNote = v))} />
        <NumField path="cluster.namespaces" label="Namespace 数" value={c.namespaces} allowNa={false} onChange={(v) => update((d) => void (d.cluster.namespaces = v))} hint="公式試験表との比較に使用" />
        <TextField
          path="cluster.operatorNotes"
          label="導入 Operator・API オブジェクト更新負荷のメモ"
          multiline
          className="span2"
          value={c.operatorNotes}
          onChange={(v) => update((d) => void (d.cluster.operatorNotes = v))}
        />
        <SelectField
          path="cluster.cpWorkerBasis"
          label="コントロールプレーン試験表と比較する台数"
          value={c.cpWorkerBasis}
          options={basisOptions}
          onChange={(v) => update((d) => void (d.cluster.cpWorkerBasis = v))}
          hint="既定：コンピュート台数（試験表の「コンピュート台数」はインフラを含まないと解釈）"
        />
        {c.cpWorkerBasis === 'manual' && (
          <NumField path="cluster.cpWorkerManual" label="比較台数（コントロールプレーン、手入力）" value={c.cpWorkerManual} allowNa={false} onChange={(v) => update((d) => void (d.cluster.cpWorkerManual = v))} />
        )}
        <SelectField
          path="cluster.infraWorkerBasis"
          label="インフラ試験表と比較する Worker 台数"
          value={c.infraWorkerBasis}
          options={basisOptions}
          onChange={(v) => update((d) => void (d.cluster.infraWorkerBasis = v))}
          hint="既定：コンピュート + インフラ（試験表の 27 台 = 24 + 3 と解釈）"
        />
        {c.infraWorkerBasis === 'manual' && (
          <NumField path="cluster.infraWorkerManual" label="比較台数（インフラ、手入力）" value={c.infraWorkerManual} allowNa={false} onChange={(v) => update((d) => void (d.cluster.infraWorkerManual = v))} />
        )}
        <CheckField
          path="cluster.plan1to1"
          label="CPU 割り当て比率が未入力の共有 CPU VM を 1 対 1 で計画する"
          checked={c.plan1to1}
          onChange={(v) => update((d) => void (d.cluster.plan1to1 = v))}
          hint="オンにすると「このアプリの仮定」として表示します"
          className="span2"
        />
      </div>
    </Card>
  );
}

function VmSection({ input, update }: { input: SizingInput; update: Update }) {
  const setVm = (id: string, fn: (v: VmProfileInput) => void) =>
    update((d) => {
      const v = d.vms.find((x) => x.id === id);
      if (v) fn(v);
    });
  const backendOptions = [{ value: '', label: '未指定' }, ...input.backends.map((b) => ({ value: b.id, label: b.name || '（名称未入力）' }))];
  return (
    <Card id="in-vm" title="VM プロファイル" kind="guest">
      <p className="hint">
        基本項目（台数・vCPU・RAM・ディスク）だけで総 vCPU、VM メモリ要求量、永続ディスク論理容量を計算します。CPU・デバイス、ストレージ性能、通信は各行の下の「詳細」を開いて入力します。最大同時稼働台数の初期値は定義台数と同数です。
      </p>
      <div className="table-wrap">
        <table className="vm-table">
          <thead>
            <tr>
              <th scope="col">プロファイル名</th>
              <th scope="col">定義台数</th>
              <th scope="col">最大同時稼働台数</th>
              <th scope="col">vCPU／台</th>
              <th scope="col">ゲスト RAM／台</th>
              <th scope="col">ディスク合計論理容量／台</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {input.vms.map((vm, i) => {
              const L = `VM ${i + 1} 行目`;
              const base = `vms.${vm.id}`;
              return (
                <Fragment key={vm.id}>
                  <tr>
                    <td>
                      <TextField path={`${base}.name`} label={`${L}のプロファイル名`} value={vm.name} onChange={(v) => setVm(vm.id, (x) => void (x.name = v))} className="sr-label" />
                    </td>
                    <td>
                      <NumField
                        hideLabel
                        allowNa={false}
                        path={`${base}.definedCount`}
                        label={`${L}の定義台数`}
                        value={vm.definedCount}
                        onChange={(v) =>
                          setVm(vm.id, (x) => {
                            x.definedCount = v;
                            if (x.runningLinked) x.runningCount = v;
                          })
                        }
                      />
                    </td>
                    <td>
                      <NumField
                        hideLabel
                        allowNa={false}
                        path={`${base}.runningCount`}
                        label={`${L}の最大同時稼働台数`}
                        value={vm.runningLinked ? vm.definedCount : vm.runningCount}
                        onChange={(v) =>
                          setVm(vm.id, (x) => {
                            x.runningCount = v;
                            x.runningLinked = false;
                          })
                        }
                      />
                      <CheckField
                        path={`${base}.runningLinked`}
                        label="定義台数と同数"
                        checked={vm.runningLinked}
                        onChange={(v) =>
                          setVm(vm.id, (x) => {
                            x.runningLinked = v;
                            if (v) x.runningCount = x.definedCount;
                          })
                        }
                        className="mini"
                      />
                    </td>
                    <td>
                      <NumField hideLabel allowNa={false} path={`${base}.vcpu`} label={`${L}の vCPU`} value={vm.vcpu} onChange={(v) => setVm(vm.id, (x) => void (x.vcpu = v))} />
                    </td>
                    <td>
                      <QtyField hideLabel path={`${base}.ram`} label={`${L}のゲスト RAM`} value={vm.ram} units={MEMORY_UNITS} onChange={(v) => setVm(vm.id, (x) => void (x.ram = v))} />
                    </td>
                    <td>
                      <QtyField hideLabel path={`${base}.disk`} label={`${L}のディスク合計論理容量`} value={vm.disk} units={CAPACITY_UNITS} onChange={(v) => setVm(vm.id, (x) => void (x.disk = v))} />
                    </td>
                    <td className="ops">
                      <button
                        type="button"
                        aria-label={`${L}を複製`}
                        onClick={() =>
                          update((d) => {
                            const idx = d.vms.findIndex((x) => x.id === vm.id);
                            d.vms.splice(idx + 1, 0, { ...structuredClone(d.vms[idx]), id: newId('vm'), name: `${d.vms[idx].name}（複製）` });
                          })
                        }
                      >
                        複製
                      </button>
                      <button
                        type="button"
                        aria-label={`${L}を削除`}
                        disabled={input.vms.length <= 1}
                        onClick={() => update((d) => void (d.vms = d.vms.filter((x) => x.id !== vm.id)))}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                  <tr id={`${base}-detail`} className="detail-row">
                    <td colSpan={7}>
                      <details>
                        <summary>
                          詳細：{vm.name || L}（CPU・デバイス、ストレージ・通信）
                        </summary>
                        <VmDetail vm={vm} label={L} setVm={(fn) => setVm(vm.id, fn)} backendOptions={backendOptions} />
                      </details>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="add" onClick={() => update((d) => void d.vms.push(emptyVm()))}>
        ＋ VM プロファイルを追加
      </button>
    </Card>
  );
}

function VmDetail({
  vm,
  label,
  setVm,
  backendOptions,
}: {
  vm: VmProfileInput;
  label: string;
  setVm: (fn: (v: VmProfileInput) => void) => void;
  backendOptions: { value: string; label: string }[];
}) {
  const base = `vms.${vm.id}`;
  const L = `${label}の`;
  return (
    <div className="vm-detail">
      <fieldset>
        <legend>CPU・デバイス</legend>
        <div className="grid">
          <SelectField
            path={`${base}.cpuMode`}
            label={`${L}CPU の種類`}
            value={vm.cpuMode}
            options={[
              { value: 'shared', label: '共有 CPU（タイムスライス）' },
              { value: 'dedicated', label: '専用 CPU（1 対 1）' },
            ]}
            onChange={(v) => setVm((x) => void (x.cpuMode = v))}
          />
          {vm.cpuMode === 'shared' && (
            <NumField
              path={`${base}.allocationRatio`}
              label={`${L}CPU 割り当て比率（vmiCPUAllocationRatio）`}
              value={vm.allocationRatio}
              onChange={(v) => setVm((x) => void (x.allocationRatio = v))}
              hint={
                <>
                  Pod CPU 要求量 = vCPU ÷ 比率 <RefLink refKey="cpuAllocationRatio" />
                </>
              }
            />
          )}
          <SelectField
            path={`${base}.peakCpuMode`}
            label={`${L}ピーク CPU の入力方法`}
            value={vm.peakCpuMode}
            options={[
              { value: 'percent', label: 'ピーク CPU 使用率（%）' },
              { value: 'cores', label: '実測 CPU（コア）' },
            ]}
            onChange={(v) => setVm((x) => void (x.peakCpuMode = v))}
          />
          <NumField path={`${base}.peakCpu`} label={vm.peakCpuMode === 'percent' ? `${L}ピーク CPU 使用率` : `${L}実測 CPU`} suffix={vm.peakCpuMode === 'percent' ? '%' : 'コア'} value={vm.peakCpu} onChange={(v) => setVm((x) => void (x.peakCpu = v))} />
          <NumField path={`${base}.extraCpu`} label={`${L}VM ごとの追加 CPU 要求量`} suffix="コア" value={vm.extraCpu} onChange={(v) => setVm((x) => void (x.extraCpu = v))} hint="必要な場合のみ。未入力なら含めません" />
          <NumField path={`${base}.graphics`} label={`${L}グラフィックスデバイス数`} value={vm.graphics} onChange={(v) => setVm((x) => void (x.graphics = v))} hint="初期値 1（このアプリの初期値）" />
          <NumField path={`${base}.sriov`} label={`${L}SR-IOV デバイス数`} value={vm.sriov} onChange={(v) => setVm((x) => void (x.sriov = v))} />
          <NumField path={`${base}.gpu`} label={`${L}GPU 数`} value={vm.gpu} onChange={(v) => setVm((x) => void (x.gpu = v))} />
          <CheckField path={`${base}.sev`} label="SEV を有効化" checked={vm.sev} onChange={(v) => setVm((x) => void (x.sev = v))} />
          <CheckField path={`${base}.tpm`} label="TPM を有効化" checked={vm.tpm} onChange={(v) => setVm((x) => void (x.tpm = v))} />
        </div>
      </fieldset>
      <fieldset>
        <legend>ストレージ・通信</legend>
        <div className="grid">
          <SelectField path={`${base}.backendId`} label={`${L}ストレージバックエンド`} value={vm.backendId} options={backendOptions} onChange={(v) => setVm((x) => void (x.backendId = v))} hint="選択肢は「ストレージバックエンド」で追加" />
          <SelectField path={`${base}.rwx`} label={`${L}RWX アクセスモード対応`} value={vm.rwx} options={TRI_OPTIONS} onChange={(v) => setVm((x) => void (x.rwx = v))} />
          <CheckField path={`${base}.migratable`} label="ライブマイグレーションの対象" checked={vm.migratable} onChange={(v) => setVm((x) => void (x.migratable = v))} />
          <NumField path={`${base}.readIops`} label={`${L}ピーク読み込み IOPS`} value={vm.readIops} onChange={(v) => setVm((x) => void (x.readIops = v))} />
          <NumField path={`${base}.writeIops`} label={`${L}ピーク書き込み IOPS`} value={vm.writeIops} onChange={(v) => setVm((x) => void (x.writeIops = v))} />
          <QtyField path={`${base}.readTp`} label={`${L}ピーク読み込みスループット`} value={vm.readTp} units={THROUGHPUT_UNITS} onChange={(v) => setVm((x) => void (x.readTp = v))} />
          <QtyField path={`${base}.writeTp`} label={`${L}ピーク書き込みスループット`} value={vm.writeTp} units={THROUGHPUT_UNITS} onChange={(v) => setVm((x) => void (x.writeTp = v))} />
          <NumField path={`${base}.latencyMs`} label={`${L}許容レイテンシ`} suffix="ms" value={vm.latencyMs} onChange={(v) => setVm((x) => void (x.latencyMs = v))} />
          <QtyField path={`${base}.txBw`} label={`${L}ピーク送信帯域`} value={vm.txBw} units={BANDWIDTH_UNITS} onChange={(v) => setVm((x) => void (x.txBw = v))} />
          <QtyField path={`${base}.rxBw`} label={`${L}ピーク受信帯域`} value={vm.rxBw} units={BANDWIDTH_UNITS} onChange={(v) => setVm((x) => void (x.rxBw = v))} />
        </div>
      </fieldset>
    </div>
  );
}

const ROLE_TITLES: Record<RoleKey, string> = {
  controlPlane: 'コントロールプレーン',
  compute: 'コンピュート（VM を稼働させる Worker）',
  infra: 'インフラ',
};

function RolesSection({ input, update }: { input: SizingInput; update: Update }) {
  return (
    <Card id="in-roles" title="候補ノード（1 台あたり）" kind="node">
      <p className="hint">
        OpenShift ノードの台数と 1 台あたりの候補仕様です。CPU は論理 CPU（vCPU）数で入力します（SMT 有効時は スレッド／コア × コア × ソケット）。
      </p>
      <CheckField
        path="cluster.infraEnabled"
        label="インフラノードを使う"
        checked={input.cluster.infraEnabled}
        onChange={(v) => update((d) => void (d.cluster.infraEnabled = v))}
        hint="オフにすると、インフラに置く設定のサービスと Virtualization のインフラ分をコンピュートへ計上します"
      />
      {(['controlPlane', 'compute', 'infra'] as RoleKey[]).map((key) => {
        if (key === 'infra' && !input.cluster.infraEnabled) return null;
        const r = input.roles[key];
        const base = `roles.${key}`;
        const set = (fn: (x: typeof r) => void) => update((d) => fn(d.roles[key]));
        const L = ROLE_TITLES[key];
        const showAlloc = key !== 'controlPlane';
        return (
          <fieldset key={key} className="role">
            <legend>{L}</legend>
            <div className="grid">
              <NumField path={`${base}.count`} label="台数" allowNa={false} value={r.count} onChange={(v) => set((x) => void (x.count = v))} hint={key === 'controlPlane' ? '基準 3 台' : key === 'infra' ? '一般推奨 3 台' : '空欄なら必要台数を算出して評価'} />
              <NumField path={`${base}.cpu`} label="CPU" suffix="vCPU" allowNa={false} value={r.cpu} onChange={(v) => set((x) => void (x.cpu = v))} />
              <QtyField path={`${base}.ram`} label="メモリ" value={r.ram} units={MEMORY_UNITS} onChange={(v) => set((x) => void (x.ram = v))} />
              <QtyField path={`${base}.disk`} label="ローカルディスク" value={r.disk} units={CAPACITY_UNITS} onChange={(v) => set((x) => void (x.disk = v))} />
              <NumField path={`${base}.iops`} label="ディスク IOPS" value={r.iops} onChange={(v) => set((x) => void (x.iops = v))} />
              <QtyField path={`${base}.nic`} label="NIC 帯域（1 ポートあたり）" value={r.nic} units={BANDWIDTH_UNITS} onChange={(v) => set((x) => void (x.nic = v))} />
              <QtyField path={`${base}.localEstimate`} label="ローカルディスク消費の見積もり" value={r.localEstimate} units={CAPACITY_UNITS} onChange={(v) => set((x) => void (x.localEstimate = v))} hint="OS・イメージ・ログ・etcd・一時領域" />
              <NumField path={`${base}.unavailable`} label="障害・メンテナンスで利用できないノード数" allowNa={false} value={r.unavailable} onChange={(v) => set((x) => void (x.unavailable = v))} />
            </div>
            {showAlloc && (
              <details className="sub" open={key === 'compute'}>
                <summary>Allocatable・常駐 Pod・Pod 枠</summary>
                <div className="grid">
                  <NumField path={`${base}.allocCpu`} label="Allocatable CPU（既存クラスタ）" suffix="コア" allowNa={false} value={r.allocCpu} onChange={(v) => set((x) => void (x.allocCpu = v))} hint="入力すると優先" />
                  <QtyField path={`${base}.allocMem`} label="Allocatable メモリ（既存クラスタ）" value={r.allocMem} units={MEMORY_UNITS} onChange={(v) => set((x) => void (x.allocMem = v))} />
                  <CheckField
                    path={`${base}.autoSysReserved`}
                    label="システム予約を公式の自動計算式で求める"
                    checked={r.autoSysReserved}
                    onChange={(v) => set((x) => void (x.autoSysReserved = v))}
                    hint={
                      <>
                        下の手入力があれば手入力を優先 <RefLink refKey="OCP-NODES" />
                      </>
                    }
                  />
                  <NumField path={`${base}.sysResCpu`} label="システム予約 CPU（手入力）" suffix="コア" allowNa={false} value={r.sysResCpu} onChange={(v) => set((x) => void (x.sysResCpu = v))} />
                  <QtyField path={`${base}.sysResMem`} label="システム予約メモリ（手入力）" value={r.sysResMem} units={MEMORY_UNITS} onChange={(v) => set((x) => void (x.sysResMem = v))} />
                  <QtyField path={`${base}.evictionMem`} label="ハード Eviction しきい値（メモリ）" value={r.evictionMem} units={MEMORY_UNITS} onChange={(v) => set((x) => void (x.evictionMem = v))} hint="既知の 0 は 0 と入力" />
                  {key === 'compute' && (
                    <>
                      <NumField path={`${base}.residentCpu`} label="常駐 Pod の CPU 要求量（1 台）" suffix="コア" allowNa={false} value={r.residentCpu} onChange={(v) => set((x) => void (x.residentCpu = v))} />
                      <QtyField path={`${base}.residentMem`} label="常駐 Pod のメモリ要求量（1 台）" value={r.residentMem} units={MEMORY_UNITS} onChange={(v) => set((x) => void (x.residentMem = v))} />
                      <CheckField
                        path={`${base}.residentIncludesVirt`}
                        label="常駐 Pod の値に Virtualization のノード分（約 2 コア・360 MiB）を含む"
                        checked={r.residentIncludesVirt}
                        onChange={(v) => set((x) => void (x.residentIncludesVirt = v))}
                        hint="含む場合は二重計上しません"
                      />
                      <NumField path={`${base}.podSlots`} label="残りの Pod 枠（1 台）" value={r.podSlots} onChange={(v) => set((x) => void (x.podSlots = v))} hint="maxPods の既定は 250（常駐 Pod を含む）" />
                    </>
                  )}
                </div>
              </details>
            )}
            {key === 'infra' && (
              <CheckField
                path="cluster.infraEvenDistribution"
                label="インフラのサービス要求量をノードへ均等配分する計画"
                checked={input.cluster.infraEvenDistribution}
                onChange={(v) => update((d) => void (d.cluster.infraEvenDistribution = v))}
                hint="オフの場合、1 台あたりの配置は未確認として扱います"
              />
            )}
          </fieldset>
        );
      })}
    </Card>
  );
}

function CpMetricsSection({ input, update }: { input: SizingInput; update: Update }) {
  const m = input.cpMetrics;
  return (
    <Card id="in-cpm" title="コントロールプレーンの計測値" kind="node">
      <div className="grid">
        <NumField path="cpMetrics.cpuUtil" label="平常時の CPU 使用率" suffix="%" value={m.cpuUtil} onChange={(v) => update((d) => void (d.cpMetrics.cpuUtil = v))} />
        <NumField path="cpMetrics.memUtil" label="平常時のメモリ使用率" suffix="%" value={m.memUtil} onChange={(v) => update((d) => void (d.cpMetrics.memUtil = v))} />
        <NumField path="cpMetrics.fsyncMs" label="etcd ディスクの p99 fsync" suffix="ms" value={m.fsyncMs} onChange={(v) => update((d) => void (d.cpMetrics.fsyncMs = v))} />
        <NumField path="cpMetrics.rttMs" label="etcd メンバー間の p99 RTT" suffix="ms" value={m.rttMs} onChange={(v) => update((d) => void (d.cpMetrics.rttMs = v))} />
      </div>
    </Card>
  );
}

function ServicesSection({ input, update }: { input: SizingInput; update: Update }) {
  const placementOptions = (Object.keys(PLACEMENT_LABELS) as Placement[]).map((p) => ({ value: p, label: PLACEMENT_LABELS[p] }));
  const backendOptions = [{ value: '', label: '未指定' }, ...input.backends.map((b) => ({ value: b.id, label: b.name || '（名称未入力）' }))];
  return (
    <Card id="in-svc" title="インフラサービス">
      <p className="hint">
        要求量は 1 レプリカあたり。監視・標準 Ingress（・Registry）は公式試験の参考サイズに含まれるため、参考サイズへは加算しません <RefLink refKey="infraScope" />。
      </p>
      {input.services.map((s) => {
        const base = `services.${s.id}`;
        const set = (fn: (x: typeof s) => void) =>
          update((d) => {
            const t = d.services.find((x) => x.id === s.id);
            if (t) fn(t);
          });
        return (
          <fieldset key={s.id} className="svc">
            <legend>{s.name || SERVICE_LABELS[s.kind]}</legend>
            <div className="grid">
              {s.kind === 'other' && <TextField path={`${base}.name`} label="サービス名" value={s.name} onChange={(v) => set((x) => void (x.name = v))} />}
              <SelectField path={`${base}.placement`} label="配置先" value={s.placement} options={placementOptions} onChange={(v) => set((x) => void (x.placement = v))} />
              <NumField path={`${base}.replicas`} label="レプリカ数" value={s.replicas} onChange={(v) => set((x) => void (x.replicas = v))} />
              <NumField path={`${base}.cpu`} label="CPU 要求量または実測（1 レプリカ）" suffix="コア" value={s.cpu} onChange={(v) => set((x) => void (x.cpu = v))} />
              <QtyField path={`${base}.mem`} label="メモリ要求量または実測（1 レプリカ）" value={s.mem} units={MEMORY_UNITS} onChange={(v) => set((x) => void (x.mem = v))} />
              {s.kind !== 'ingress' && <SelectField path={`${base}.backendId`} label="保存先ストレージ" value={s.backendId} options={backendOptions} onChange={(v) => set((x) => void (x.backendId = v))} />}
              {s.kind === 'monitoring' && (
                <>
                  <NumField path={`${base}.timeSeries`} label="時系列数" value={s.timeSeries} onChange={(v) => set((x) => void (x.timeSeries = v))} />
                  <NumField path={`${base}.scrapeSec`} label="収集間隔" suffix="秒" value={s.scrapeSec} onChange={(v) => set((x) => void (x.scrapeSec = v))} />
                  <NumField path={`${base}.retentionDays`} label="保持日数" suffix="日" value={s.retentionDays} onChange={(v) => set((x) => void (x.retentionDays = v))} hint="未入力なら公式既定値 15 日" />
                  <QtyField path={`${base}.perReplicaPerDay`} label="1 レプリカ・1 日あたりの実効保存量" value={s.perReplicaPerDay} units={CAPACITY_UNITS} onChange={(v) => set((x) => void (x.perReplicaPerDay = v))} hint="圧縮等の影響を含む実測値" />
                </>
              )}
              {(s.kind === 'registry' || s.kind === 'logging' || s.kind === 'other') && (
                <QtyField path={`${base}.capacity`} label="実効保存量（合計）" value={s.capacity} units={CAPACITY_UNITS} onChange={(v) => set((x) => void (x.capacity = v))} />
              )}
              {s.kind !== 'ingress' && <NumField path={`${base}.pvFreePct`} label="PV に確保する空き容量比率" suffix="%" value={s.pvFreePct} onChange={(v) => set((x) => void (x.pvFreePct = v))} />}
              {s.kind === 'ingress' && (
                <>
                  <QtyField path={`${base}.peakBw`} label="ピーク帯域（クラスタ合計）" value={s.peakBw} units={BANDWIDTH_UNITS} onChange={(v) => set((x) => void (x.peakBw = v))} />
                  <TextField path={`${base}.requestRate`} label="リクエスト量（メモ）" value={s.requestRate} onChange={(v) => set((x) => void (x.requestRate = v))} />
                </>
              )}
            </div>
            {s.kind === 'other' && (
              <button type="button" onClick={() => update((d) => void (d.services = d.services.filter((x) => x.id !== s.id)))}>
                このサービスを削除
              </button>
            )}
          </fieldset>
        );
      })}
      <button type="button" className="add" onClick={() => update((d) => void d.services.push({ ...emptyService('other'), name: 'その他のサービス' }))}>
        ＋ その他のサービスを追加
      </button>
    </Card>
  );
}

function AvailabilitySection({ input, update }: { input: SizingInput; update: Update }) {
  const a = input.availability;
  return (
    <Card id="in-avail" title="可用性・ライブマイグレーション">
      <p className="hint">ロールごとの「利用できないノード数」は候補ノードの欄で入力します。同時 drain ノード数とクラスタの同時移行件数は別の値です。</p>
      <div className="grid">
        <NumField path="availability.computeDrain" label="コンピュートの同時 drain ノード数" value={a.computeDrain} onChange={(v) => update((d) => void (d.availability.computeDrain = v))} />
        <NumField path="availability.parallelMigrations" label="同時移行数（クラスタ全体）" value={a.parallelMigrations} onChange={(v) => update((d) => void (d.availability.parallelMigrations = v))} hint="未入力なら公式既定値 5 件" />
        <NumField path="availability.parallelPerNode" label="送信元ノードごとの同時移行数" value={a.parallelPerNode} onChange={(v) => update((d) => void (d.availability.parallelPerNode = v))} hint="未入力なら公式既定値 2 件" />
        <NumField path="availability.migrationTargetSec" label="移行の目標時間" suffix="秒" value={a.migrationTargetSec} onChange={(v) => update((d) => void (d.availability.migrationTargetSec = v))} />
        <QtyField path="availability.dirtyRate" label="移行中のメモリ更新速度" value={a.dirtyRate} units={THROUGHPUT_UNITS} onChange={(v) => update((d) => void (d.availability.dirtyRate = v))} />
        <QtyField path="availability.measuredTransfer" label="実測の総転送量" value={a.measuredTransfer} units={CAPACITY_UNITS} onChange={(v) => update((d) => void (d.availability.measuredTransfer = v))} />
        <SelectField path="availability.cpuModelCompatible" label="ノード間の CPU モデル互換性" value={a.cpuModelCompatible} options={TRI_OPTIONS} onChange={(v) => update((d) => void (d.availability.cpuModelCompatible = v))} />
        <CheckField
          path="availability.placementConstraints"
          label="NUMA・アフィニティ等の配置制約がある"
          checked={a.placementConstraints}
          onChange={(v) => update((d) => void (d.availability.placementConstraints = v))}
          hint="オンにすると配置結果は要個別評価になります"
        />
        <TextField path="availability.placementNote" label="配置制約のメモ" value={a.placementNote} onChange={(v) => update((d) => void (d.availability.placementNote = v))} />
      </div>
    </Card>
  );
}

function NetworkSection({ input, update }: { input: SizingInput; update: Update }) {
  return (
    <Card id="in-net" title="ネットワーク経路" kind="node">
      <p className="hint">
        同じ NIC 名の共有経路はノードあたりの値を合計して評価します。ノードへの配分が分からない場合、ノードあたりは空欄のままにしてください（推測で割り当てません）。ゲスト経路のクラスタ合計を空欄にすると VM プロファイルから算出します。
      </p>
      <div className="table-wrap">
        <table className="net-table">
          <thead>
            <tr>
              <th scope="col">経路</th>
              <th scope="col">NIC 名</th>
              <th scope="col">専用</th>
              <th scope="col">ピーク送信（クラスタ）</th>
              <th scope="col">ピーク受信（クラスタ）</th>
              <th scope="col">ピーク送信（ノードあたり）</th>
              <th scope="col">ピーク受信（ノードあたり）</th>
            </tr>
          </thead>
          <tbody>
            {input.paths.map((p) => {
              const base = `paths.${p.key}`;
              const L = `${PATH_LABELS[p.key]}経路の`;
              const set = (fn: (x: typeof p) => void) =>
                update((d) => {
                  const t = d.paths.find((x) => x.key === p.key);
                  if (t) fn(t);
                });
              return (
                <tr key={p.key}>
                  <th scope="row">{PATH_LABELS[p.key]}</th>
                  <td>
                    <TextField path={`${base}.nic`} label={`${L}NIC 名`} value={p.nic} onChange={(v) => set((x) => void (x.nic = v))} className="sr-label" />
                  </td>
                  <td>
                    <CheckField path={`${base}.dedicated`} label="専用" checked={p.dedicated} onChange={(v) => set((x) => void (x.dedicated = v))} className="mini" />
                  </td>
                  <td>
                    <QtyField hideLabel path={`${base}.clusterTx`} label={`${L}ピーク送信（クラスタ）`} value={p.clusterTx} units={BANDWIDTH_UNITS} onChange={(v) => set((x) => void (x.clusterTx = v))} />
                  </td>
                  <td>
                    <QtyField hideLabel path={`${base}.clusterRx`} label={`${L}ピーク受信（クラスタ）`} value={p.clusterRx} units={BANDWIDTH_UNITS} onChange={(v) => set((x) => void (x.clusterRx = v))} />
                  </td>
                  <td>
                    <QtyField hideLabel path={`${base}.perNodeTx`} label={`${L}ピーク送信（ノードあたり）`} value={p.perNodeTx} units={BANDWIDTH_UNITS} onChange={(v) => set((x) => void (x.perNodeTx = v))} />
                  </td>
                  <td>
                    <QtyField hideLabel path={`${base}.perNodeRx`} label={`${L}ピーク受信（ノードあたり）`} value={p.perNodeRx} units={BANDWIDTH_UNITS} onChange={(v) => set((x) => void (x.perNodeRx = v))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BackendsSection({ input, update }: { input: SizingInput; update: Update }) {
  return (
    <Card id="in-sb" title="ストレージバックエンド">
      <p className="hint">未確定の値は空欄のまま計算できます（未入力の項目は含めず、結果に明示します）。</p>
      {input.backends.map((b, i) => {
        const base = `backends.${b.id}`;
        const set = (fn: (x: typeof b) => void) =>
          update((d) => {
            const t = d.backends.find((x) => x.id === b.id);
            if (t) fn(t);
          });
        return (
          <fieldset key={b.id} className="svc">
            <legend>{b.name || `バックエンド ${i + 1}`}</legend>
            <div className="grid">
              <TextField path={`${base}.name`} label="名称（ストレージクラス等）" value={b.name} onChange={(v) => set((x) => void (x.name = v))} />
              <NumField path={`${base}.factor`} label="物理容量係数（レプリケーション・EC）" value={b.factor} onChange={(v) => set((x) => void (x.factor = v))} hint="例：3 レプリカなら 3" />
              <QtyField path={`${base}.snapshotGrowth`} label="スナップショット・増加見込み（論理）" value={b.snapshotGrowth} units={CAPACITY_UNITS} onChange={(v) => set((x) => void (x.snapshotGrowth = v))} />
              <NumField path={`${base}.freePct`} label="確保する空き容量比率" suffix="%" value={b.freePct} onChange={(v) => set((x) => void (x.freePct = v))} />
              <NumField path={`${base}.specReadIops`} label="読み込み IOPS（仕様・測定）" value={b.specReadIops} onChange={(v) => set((x) => void (x.specReadIops = v))} />
              <NumField path={`${base}.specWriteIops`} label="書き込み IOPS（仕様・測定）" value={b.specWriteIops} onChange={(v) => set((x) => void (x.specWriteIops = v))} />
              <QtyField path={`${base}.specReadTp`} label="読み込みスループット（仕様・測定）" value={b.specReadTp} units={THROUGHPUT_UNITS} onChange={(v) => set((x) => void (x.specReadTp = v))} />
              <QtyField path={`${base}.specWriteTp`} label="書き込みスループット（仕様・測定）" value={b.specWriteTp} units={THROUGHPUT_UNITS} onChange={(v) => set((x) => void (x.specWriteTp = v))} />
              <NumField path={`${base}.measuredLatencyMs`} label="実測レイテンシ" suffix="ms" value={b.measuredLatencyMs} onChange={(v) => set((x) => void (x.measuredLatencyMs = v))} />
            </div>
            <button
              type="button"
              onClick={() =>
                update((d) => {
                  d.backends = d.backends.filter((x) => x.id !== b.id);
                  d.vms.forEach((v) => {
                    if (v.backendId === b.id) v.backendId = '';
                  });
                  d.services.forEach((s) => {
                    if (s.backendId === b.id) s.backendId = '';
                  });
                })
              }
            >
              このバックエンドを削除
            </button>
          </fieldset>
        );
      })}
      <button type="button" className="add" onClick={() => update((d) => void d.backends.push({ ...emptyBackend(), name: `ストレージ ${d.backends.length + 1}` }))}>
        ＋ ストレージバックエンドを追加
      </button>
    </Card>
  );
}
