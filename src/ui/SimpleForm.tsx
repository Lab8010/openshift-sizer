import { CPU_RATIO_OPTIONS, SIMPLE_BACKEND_ID, SIMPLE_DEFAULT_ASSUMPTIONS, TOLERANCE_OPTIONS, emptySimpleVm, type SimpleInput, type SimpleVm } from '../domain/simple';
import { newId } from '../domain/types';
import { CAPACITY_UNITS, MEMORY_UNITS } from '../domain/units';
import { RefLink } from './common';
import { NumField, QtyField, SelectField, TextField } from './fields';

export type SimpleUpdate = (fn: (d: SimpleInput) => void) => void;

export function SimpleForm({ simple, update }: { simple: SimpleInput; update: SimpleUpdate }) {
  const setVm = (id: string, fn: (v: SimpleVm) => void) =>
    update((d) => {
      const v = d.vms.find((x) => x.id === id);
      if (v) fn(v);
    });
  return (
    <div className="simple-form">
      <section className="card card-guest" aria-labelledby="s-vm-h">
        <h2 id="s-vm-h">
          <span className="tag tag-guest">ゲスト VM</span>仮想マシン
        </h2>
        <p className="hint">VM の種類ごとに、台数と 1 台あたりのサイズを入力します。</p>
        <div className="table-wrap">
          <table className="simple-vm-table">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">名前</th>
                <th scope="col">台数</th>
                <th scope="col">vCPU／台</th>
                <th scope="col">メモリ／台</th>
                <th scope="col">ディスク／台</th>
                <th scope="col">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {simple.vms.map((vm, i) => {
                const L = `VM ${i + 1} 行目`;
                const base = `vms.${vm.id}`;
                return (
                  <tr key={vm.id}>
                    <td>
                      <TextField path={`${base}.name`} label={`${L}の名前`} value={vm.name} onChange={(v) => setVm(vm.id, (x) => void (x.name = v))} className="sr-label" />
                    </td>
                    <td>
                      <NumField hideLabel allowNa={false} path={`${base}.definedCount`} label={`${L}の台数`} value={vm.count} onChange={(v) => setVm(vm.id, (x) => void (x.count = v))} />
                    </td>
                    <td>
                      <NumField hideLabel allowNa={false} path={`${base}.vcpu`} label={`${L}の vCPU`} value={vm.vcpu} onChange={(v) => setVm(vm.id, (x) => void (x.vcpu = v))} />
                    </td>
                    <td>
                      <QtyField hideLabel path={`${base}.ram`} label={`${L}のメモリ`} value={vm.ram} units={MEMORY_UNITS} onChange={(v) => setVm(vm.id, (x) => void (x.ram = v))} />
                    </td>
                    <td>
                      <QtyField hideLabel path={`${base}.disk`} label={`${L}のディスク`} value={vm.disk} units={CAPACITY_UNITS} onChange={(v) => setVm(vm.id, (x) => void (x.disk = v))} />
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
                      <button type="button" aria-label={`${L}を削除`} disabled={simple.vms.length <= 1} onClick={() => update((d) => void (d.vms = d.vms.filter((x) => x.id !== vm.id)))}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="add" onClick={() => update((d) => void d.vms.push(emptySimpleVm()))}>
          ＋ VM の種類を追加
        </button>
        <div className="grid compact">
          <SelectField
            path="simple.cpuRatio"
            label="CPU 割り当て比率（vCPU : 物理 CPU）"
            value={simple.cpuRatio}
            options={CPU_RATIO_OPTIONS.map((r) => ({ value: r, label: r === '1' ? '1:1（オーバーコミットなし）' : `${r}:1` }))}
            onChange={(v) => update((d) => void (d.cpuRatio = v))}
            hint={
              <>
                比率が大きいほど少ない CPU で多くの vCPU を割り当てます <RefLink refKey="cpuAllocationRatio" />
              </>
            }
          />
        </div>
      </section>

      <section className="card card-node" aria-labelledby="s-srv-h">
        <h2 id="s-srv-h">
          <span className="tag tag-node">OpenShift ノード</span>VM 用の物理サーバ
        </h2>
        <p className="hint">VM を稼働させるサーバ（コンピュートノード）の台数と 1 台あたりの仕様です。台数を空欄にすると必要台数だけを計算します。</p>
        <div className="grid compact">
          <NumField path="roles.compute.count" label="台数" allowNa={false} value={simple.servers.count} onChange={(v) => update((d) => void (d.servers.count = v))} />
          <NumField
            path="roles.compute.cpu"
            label="CPU（論理コア数／台）"
            allowNa={false}
            value={simple.servers.cpu}
            onChange={(v) => update((d) => void (d.servers.cpu = v))}
            hint="ハイパースレッディング有効時はスレッド数"
          />
          <QtyField path="roles.compute.ram" label="メモリ／台" value={simple.servers.ram} units={MEMORY_UNITS} onChange={(v) => update((d) => void (d.servers.ram = v))} />
          <SelectField
            path="simple.tolerance"
            label="停止・メンテナンスを許容する台数"
            value={simple.tolerance}
            options={TOLERANCE_OPTIONS.map((t) => ({ value: t, label: t === '0' ? '0 台（予備なし）' : `${t} 台（N+${t}）` }))}
            onChange={(v) => update((d) => void (d.tolerance = v))}
            hint="障害時の残存容量と、ライブマイグレーション用の予備メモリの評価に使います"
          />
        </div>
      </section>

      <section className="card" aria-labelledby="s-cl-h">
        <h2 id="s-cl-h">クラスタ構成（任意）</h2>
        <div className="grid compact">
          <TextField path="simple.projectName" label="案件名" value={simple.projectName} onChange={(v) => update((d) => void (d.projectName = v))} />
          <SelectField
            path="simple.infra"
            label="インフラノード"
            value={simple.infra}
            options={[
              { value: 'separate', label: '別に 3 台用意する' },
              { value: 'none', label: '使わない' },
            ]}
            onChange={(v) => update((d) => void (d.infra = v))}
            hint="コントロールプレーン 3 台は常に別に必要です"
          />
          <NumField
            path="cluster.namespaces"
            label="Namespace 数（目安）"
            allowNa={false}
            value={simple.namespaces}
            onChange={(v) => update((d) => void (d.namespaces = v))}
            hint="コントロールプレーン・インフラの公式試験の参考値を出すのに使います"
          />
          <NumField
            path={`backends.${SIMPLE_BACKEND_ID}.factor`}
            label="共有ストレージの物理容量係数"
            value={simple.storageFactor}
            onChange={(v) => update((d) => void (d.storageFactor = v))}
            hint="例：3 レプリカなら 3。空欄なら物理容量は未算出"
          />
        </div>
      </section>

      <details className="card assumptions-card">
        <summary>簡易版の仮定値（必要なら変更）</summary>
        <p className="hint">
          簡易版では尋ねない値を、次の仮定値で計算します。公式値ではありません。実測値があれば置き換えてください。システム予約は公式の自動計算式で求めます <RefLink refKey="OCP-NODES" />。
        </p>
        <div className="grid compact">
          <NumField
            path="roles.compute.residentCpu"
            label="常駐 Pod の CPU 要求量（1 台）"
            suffix="コア"
            allowNa={false}
            value={simple.assumptions.residentCpu}
            onChange={(v) => update((d) => void (d.assumptions.residentCpu = v))}
          />
          <QtyField
            path="roles.compute.residentMem"
            label="常駐 Pod のメモリ要求量（1 台）"
            value={simple.assumptions.residentMem}
            units={MEMORY_UNITS}
            onChange={(v) => update((d) => void (d.assumptions.residentMem = v))}
          />
          <QtyField
            path="roles.compute.evictionMem"
            label="ハード Eviction しきい値（メモリ）"
            value={simple.assumptions.evictionMem}
            units={MEMORY_UNITS}
            onChange={(v) => update((d) => void (d.assumptions.evictionMem = v))}
          />
        </div>
        <button type="button" onClick={() => update((d) => void (d.assumptions = structuredClone(SIMPLE_DEFAULT_ASSUMPTIONS)))}>
          仮定値を初期値に戻す
        </button>
      </details>
    </div>
  );
}
