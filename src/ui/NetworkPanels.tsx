// サイジング結果・印刷レポートに出すネットワーク診断の要約。
import { networkSummary, type NetworkState } from '../domain/networkLink';
import { SRIOV_DEVICE_OPTIONS, type SimpleInput, type SriovDevices } from '../domain/simple';
import { Button } from './kit';
import type { SimpleUpdate } from './SizingWizard';

function ReachBadge({ reachable }: { reachable: boolean }) {
  return reachable ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">✓ ゲスト IP が宛先になる</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">✕ ゲスト IP は宛先にならない</span>
  );
}

/** 簡易版の結果画面に出すネットワーク構成のパネル（Tailwind） */
export function NetworkPanel({
  network,
  simple,
  update,
  onDiagnose,
  onOpenResult,
}: {
  network: NetworkState;
  simple: SimpleInput;
  update: SimpleUpdate;
  onDiagnose: () => void;
  onOpenResult: () => void;
}) {
  const d = network.diagnosis;
  const showSriov = (d && d.exceptionNote === 'F') || simple.sriov.vmIds.length > 0;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby="net-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="net-h" className="font-bold text-slate-900">
          ネットワーク構成
        </h2>
        {d ? (
          <Button variant="secondary" onClick={onOpenResult} className="no-print">
            診断結果・YAML を見る →
          </Button>
        ) : (
          <Button variant="secondary" onClick={onDiagnose} className="no-print">
            {Object.keys(network.answers).length ? '診断の続きをする →' : 'ネットワーク構成を診断する →'}
          </Button>
        )}
      </div>
      {d ? (
        (() => {
          const s = networkSummary(d);
          return (
            <>
              <p className="mt-2 text-lg font-bold text-slate-900">{s.title}</p>
              <p className="mt-1 text-slate-700">{s.conclusion}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ReachBadge reachable={s.guestIpReachable} />
                {s.multihome && <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">＋ マルチホーム</span>}
                {s.sriov && <span className="rounded-full border border-violet-300 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800">SR-IOV を検討（例外枠）</span>}
              </div>
            </>
          );
        })()
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          VM のネットワークをどう載せるか（Pod Network、UDN、Localnet など）はまだ診断していません。約 3 分の質問に答えると、構成図・理由・サンプル YAML を出し、この結果と PDF レポートにも載せます。
        </p>
      )}

      {showSriov && (
        <div className="mt-4 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200">
          <p className="text-sm font-medium text-violet-950">SR-IOV を使う VM</p>
          <p className="mt-1 text-xs leading-relaxed text-violet-900">選んだ VM は、SR-IOV デバイス 1 個あたり 1 GiB の追加メモリを計算に含め、配置は要個別評価として扱います（公式の VM 追加メモリの式）。</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {simple.vms.map((v) => {
              const checked = simple.sriov.vmIds.includes(v.id);
              return (
                <label key={v.id} className="inline-flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-700"
                    checked={checked}
                    onChange={(e) =>
                      update((s) => {
                        s.sriov.vmIds = e.target.checked ? [...s.sriov.vmIds, v.id] : s.sriov.vmIds.filter((id) => id !== v.id);
                      })
                    }
                  />
                  {v.name || 'VM'}（{v.count || '—'} 台）
                </label>
              );
            })}
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-800">
            VM 1 台あたりのデバイス数
            <select
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
              value={simple.sriov.devicesPerVm}
              onChange={(e) => update((s) => void (s.sriov.devicesPerVm = e.target.value as SriovDevices))}
            >
              {SRIOV_DEVICE_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

/** 印刷レポート・詳細入力の結果に載せるネットワーク診断の節（legacy スタイル） */
export function NetworkReportSection({ network, heading }: { network: NetworkState; heading: string }) {
  const d = network.diagnosis;
  if (!d) {
    return (
      <section>
        <h2>{heading}</h2>
        <p className="small">ネットワーク構成はまだ診断していません（アプリの「ネットワーク診断」で診断できます）。</p>
      </section>
    );
  }
  const s = networkSummary(d);
  return (
    <section>
      <h2>{heading}</h2>
      <table className="data input-table">
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '82%' }} />
        </colgroup>
        <tbody>
          <tr>
            <th scope="row">診断結果</th>
            <td>
              <strong>{s.title}</strong>：{s.conclusion}
            </td>
          </tr>
          <tr>
            <th scope="row">ゲスト IP</th>
            <td>{s.guestIpReachable ? '宛先になる' : '宛先にならない（Service などで公開）'}</td>
          </tr>
          <tr>
            <th scope="row">追加の構成</th>
            <td>{[s.multihome ? 'マルチホーム（追加 NIC 用の Secondary ネットワーク）' : '', s.sriov ? 'SR-IOV を例外枠として検討' : ''].filter(Boolean).join('、') || 'なし'}</td>
          </tr>
        </tbody>
      </table>
      <h3>なぜこの構成か</h3>
      <ul>
        {s.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {s.warnings.length > 0 && (
        <>
          <h3>注意</h3>
          <ul>
            {s.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}
      {s.checklist.length > 0 && (
        <>
          <h3>移行チェックリスト</h3>
          <ul>
            {s.checklist.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {s.unknowns.length > 0 && (
        <>
          <h3>「分からない」と答えた質問（要確認）</h3>
          <ul>
            {s.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </>
      )}
      <p className="small">構成図とサンプル YAML は、アプリの「ネットワーク診断」の結果画面で確認できます。</p>
    </section>
  );
}
