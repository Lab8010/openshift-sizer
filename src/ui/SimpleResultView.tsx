// 簡易版の結果画面（Network Advisor の結果画面と同じ構成）。
import { KIND_LABEL, STATUS_LABEL, type SizingResult } from '../domain/result';
import { SIMPLE_DEFAULT_ASSUMPTIONS, type SimpleInput } from '../domain/simple';
import { SIMPLE_CHECKLIST, SIMPLE_GROUP_IDS, isSimpleOpenItem, type SimpleView } from '../domain/simpleView';
import { MEMORY_UNITS } from '../domain/units';
import { RefLinks } from './common';
import { Accordion, Button, StatusPill, TwNumber, TwQty, TwText } from './kit';
import { SectionView, SourcesList } from './ResultParts';
import type { SimpleUpdate } from './SizingWizard';
import { networkSizingChecks, type NetworkState } from '../domain/networkLink';
import { NetworkPanel } from './NetworkPanels';

interface Props {
  result: SizingResult;
  view: SimpleView;
  simple: SimpleInput;
  update: SimpleUpdate;
  onEdit: () => void;
  onRestart: () => void;
  onPrint: () => void;
  onExport: () => void;
  onDetail: () => void;
  network: NetworkState;
  onDiagnose: () => void;
  onOpenNetwork: () => void;
}

export function SimpleResultView({ result, view, simple, update, onEdit, onRestart, onPrint, onExport, onDetail, network, onDiagnose, onOpenNetwork }: Props) {
  const checklist = [...(network.diagnosis ? networkSizingChecks(network.diagnosis) : []), ...SIMPLE_CHECKLIST];
  const open = result.openItems.filter((o) => isSimpleOpenItem(o.itemId));
  const warnings = open.filter((o) => o.status === 'ng' || o.status === 'individual');
  const toConfirm = open.filter((o) => o.status !== 'ng' && o.status !== 'individual');

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <section>
        <p className="text-sm font-medium text-red-700">サイジング結果</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{view.verdict.headline}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={view.verdict.status} />
          {simple.isSample && <span className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs text-slate-600">サンプル値</span>}
          {result.inputErrorCount > 0 && <StatusPill status="ng">入力エラー {result.inputErrorCount} 件</StatusPill>}
        </div>
        <ul className="mt-3 space-y-1 text-slate-700">
          {view.verdict.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {view.cards.map((c) => (
            <div key={c.title} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-500">{c.title}</span>
                {c.status && c.status !== 'calculated' && <StatusPill status={c.status} />}
              </div>
              <p className="mt-2 text-lg font-bold leading-snug text-slate-900">{c.value}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.sub}</p>
            </div>
          ))}
        </div>

        {view.reasons.length > 0 && (
          <>
            <h2 className="mt-6 font-bold text-slate-900">なぜこの台数か</h2>
            <ol className="mt-3 grid gap-3 md:grid-cols-3">
              {view.reasons.map((r, i) => (
                <li key={i} className="rounded-xl bg-white p-4 text-sm leading-relaxed ring-1 ring-slate-200">
                  <span className="block font-semibold text-slate-900">{r.title}</span>
                  <span className="mt-1 block text-slate-700">→ {r.text}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <NetworkPanel network={network} simple={simple} update={update} onDiagnose={onDiagnose} onOpenResult={onOpenNetwork} />

        <div className="no-print mt-5 flex flex-wrap gap-2">
          <Button onClick={onPrint}>印刷／PDF 保存</Button>
          <Button variant="secondary" onClick={onEdit}>
            回答を直す
          </Button>
          <Button variant="secondary" onClick={onDetail}>
            詳細入力で見積もる
          </Button>
          <Button variant="secondary" onClick={onExport}>
            JSON を保存
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            最初からやり直す
          </Button>
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="mt-8 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-5 py-4" aria-label="注意">
          <h2 className="font-bold text-amber-950">注意</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-amber-950">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>⚠</span>
                <span>
                  <span className="font-semibold">{w.label}</span>（{STATUS_LABEL[w.status]}）{w.detail ? `：${w.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 space-y-3">
        <Accordion title="数値の内訳" meta="VM の合計・物理サーバ・コントロールプレーン・インフラ">
          {view.sections.map((s) => (
            <div key={s.title} className="mt-4 first:mt-0">
              <h3 className="text-sm font-semibold text-slate-800">{s.title}</h3>
              <dl className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {s.rows.map((r, i) => (
                  <div key={i} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:gap-4">
                    <dt className="text-slate-600">{r.label}</dt>
                    <dd className="text-slate-900">
                      <span className="tabular-nums">{r.value}</span>
                      {(r.note || r.refs?.length) && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {r.note} <RefLinks refs={r.refs} />
                        </span>
                      )}
                    </dd>
                    <dd className="flex flex-wrap items-start gap-1 sm:justify-end">
                      <span className="rounded border border-slate-200 px-1.5 text-xs text-slate-500">{KIND_LABEL[r.kind]}</span>
                      {r.status && <StatusPill status={r.status} />}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Accordion>

        <Accordion title="前提と仮定" meta={`${result.assumptions.length} 件・仮定値を変更できます`}>
          <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700">
            {result.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded border border-dashed border-slate-300 px-1.5 text-xs text-slate-500">{KIND_LABEL[a.kind]}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">簡易版の仮定値（公式値ではありません。実測値があれば置き換えてください）</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <TwNumber path="roles.compute.residentCpu" label="常駐 Pod の CPU 要求量（1 台）" suffix="コア" value={simple.assumptions.residentCpu} onChange={(v) => update((d) => void (d.assumptions.residentCpu = v))} />
              <TwQty path="roles.compute.residentMem" label="常駐 Pod のメモリ要求量（1 台）" value={simple.assumptions.residentMem} units={MEMORY_UNITS} onChange={(v) => update((d) => void (d.assumptions.residentMem = v))} />
              <TwQty path="roles.compute.evictionMem" label="ハード Eviction しきい値" value={simple.assumptions.evictionMem} units={MEMORY_UNITS} onChange={(v) => update((d) => void (d.assumptions.evictionMem = v))} />
            </div>
            <Button variant="ghost" className="mt-2 !px-3" onClick={() => update((d) => void (d.assumptions = structuredClone(SIMPLE_DEFAULT_ASSUMPTIONS)))}>
              初期値に戻す
            </Button>
          </div>
        </Accordion>

        <Accordion title="導入前に確認すること" meta={`${checklist.length + toConfirm.length} 件`}>
          <p className="text-sm text-slate-600">簡易版では入力しない項目です。実環境で確かめてください。ネットワークやストレージ性能は詳細入力でも見積もれます。</p>
          <ul className="mt-3 space-y-2 text-sm">
            {checklist.map((c, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-slate-50 p-3 leading-relaxed text-slate-700">
                <span aria-hidden className="text-slate-400">
                  □
                </span>
                <span>
                  {c.text} <RefLinks refs={c.refs} />
                </span>
              </li>
            ))}
          </ul>
          {toConfirm.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {toConfirm.map((o, i) => (
                <li key={i} className="rounded-lg bg-slate-50 p-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusPill status={o.status} />
                    <span className="font-medium text-slate-800">{o.label}</span>
                  </span>
                  {o.detail && <span className="mt-1 block text-slate-600">{o.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </Accordion>

        <Accordion title="計算の内訳（式・入力値・出典）">
          <div className="legacy">
            {result.groups
              .filter((g) => SIMPLE_GROUP_IDS.includes(g.id))
              .map((g) => (
                <div key={g.id}>
                  <h3>{g.title}</h3>
                  {g.sections.map((s) => (
                    <SectionView key={s.id} section={s} />
                  ))}
                </div>
              ))}
          </div>
        </Accordion>

        <Accordion title="出典（Red Hat 4.22 公式資料）">
          <div className="legacy">
            <SourcesList result={result} />
          </div>
        </Accordion>

        <Accordion title="レポートに載せる案件名">
          <div className="max-w-md">
            <TwText path="simple.projectName" label="案件名" value={simple.projectName} onChange={(v) => update((d) => void (d.projectName = v))} />
          </div>
        </Accordion>
      </section>
    </div>
  );
}
