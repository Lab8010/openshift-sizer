import { useEffect, useMemo } from 'react';
import type { PrimaryPatternId } from '../data/types';
import { compareRows, fitsFor, patterns, ratingMark, type Rating } from '../data/patterns';
import { previewDiagnosis } from '../lib/preview';
import { resolveParams } from '../lib/generateYaml';
import { Diagram } from './Diagram';
import { DocsFooter, PatternAccordions, YamlSection, usePatternParams, usePrintOpensDetails } from './PatternSections';
import { Button, ReachBadge, RichText } from './ui';

const PRIMARY: PrimaryPatternId[] = ['A', 'B', 'C', 'D'];

interface Props {
  selected: PrimaryPatternId | null;
  /** 診断結果から来たとき、比較表で強調する列 */
  highlight?: PrimaryPatternId;
  /** 表示直後に比較表までスクロールする */
  focusCompare?: boolean;
  onSelect: (p: PrimaryPatternId | null, opts?: { focusCompare?: boolean }) => void;
  onStartDiagnosis: () => void;
}

export function PatternsPage({ selected, highlight, focusCompare, onSelect, onStartDiagnosis }: Props) {
  useEffect(() => {
    if (selected) window.scrollTo({ top: 0 });
    else if (focusCompare) document.getElementById('compare')?.scrollIntoView();
    else window.scrollTo({ top: 0 });
  }, [selected, focusCompare]);

  if (selected) {
    return (
      <PatternDetail
        key={selected}
        id={selected}
        onBack={() => onSelect(null)}
        onCompare={() => onSelect(null, { focusCompare: true })}
        onStartDiagnosis={onStartDiagnosis}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">構成パターン一覧</h1>
      <p className="mt-2 text-slate-600">
        診断の前に、用意されているゴールを見ておけます。どれになるか迷ったら、診断で確かめてください。
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {PRIMARY.map((id) => {
          const p = patterns[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex flex-col rounded-2xl border-2 bg-white p-5 text-left transition hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 ${
                highlight === id ? 'border-red-700' : 'border-slate-200'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-red-700">
                パターン {id}
                {highlight === id && (
                  <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs text-white">あなたの診断結果</span>
                )}
              </span>
              <span className="mt-1 text-xl font-bold text-slate-900">{p.shortName}</span>
              <span className="mt-1 text-slate-700">{p.conclusion}</span>
              <span className="mt-3">
                <ReachBadge reachable={p.guestIpReachable} />
              </span>
              <span className="mt-3 text-sm leading-relaxed text-slate-600">
                <span className="font-medium text-slate-700">向いている VM:</span> {fitsFor[id]}
              </span>
              <span className="mt-auto pt-4 text-sm font-medium text-red-800">詳しく見る（構成図・YAML）→</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {(['E', 'F'] as const).map((id) => (
          <div key={id} className="rounded-xl bg-slate-100 px-4 py-3 leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">
              パターン {id}: {patterns[id].shortName}
            </span>
            <span className="ml-2 text-xs text-slate-500">{id === 'E' ? '修飾（A〜D に追加）' : '例外枠'}</span>
            <span className="mt-1 block">{fitsFor[id]}</span>
          </div>
        ))}
      </div>

      <CompareTable highlight={highlight} onSelect={(id) => onSelect(id)} />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button onClick={onStartDiagnosis}>どれになるか診断する →</Button>
        <span className="text-sm text-slate-500">約 3 分・質問は 5〜10 問</span>
      </div>
    </div>
  );
}

const ratingStyle: Record<Rating, string> = {
  good: 'text-emerald-700',
  ok: 'text-sky-700',
  caution: 'text-amber-700',
  ng: 'text-rose-700',
};

function CompareTable({ highlight, onSelect }: { highlight?: PrimaryPatternId; onSelect: (id: PrimaryPatternId) => void }) {
  return (
    <section id="compare" className="mt-12 scroll-mt-4">
      <h2 className="text-xl font-bold text-slate-900">利点と考慮事項の比較</h2>
      <p className="mt-1 text-sm text-slate-600">
        {(['good', 'ok', 'caution', 'ng'] as const).map((r) => (
          <span key={r} className="mr-4 inline-block">
            <span className={`font-bold ${ratingStyle[r]}`}>{ratingMark[r].mark}</span> {ratingMark[r].label}
          </span>
        ))}
      </p>
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-10 w-44 bg-white px-4 py-3 text-xs font-medium text-slate-500">比べる観点</th>
              {PRIMARY.map((id) => (
                <th key={id} className={`px-4 py-3 align-bottom ${highlight === id ? 'bg-red-50' : ''}`}>
                  {highlight === id && <span className="mb-1 block text-xs font-medium text-red-700">あなたの診断結果</span>}
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    className="text-left font-semibold text-slate-900 underline-offset-2 hover:text-red-800 hover:underline"
                  >
                    {id}: {patterns[id].shortName}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {compareRows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 align-top font-medium text-slate-800">
                  {row.label}
                  {row.hint && <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.hint}</span>}
                </th>
                {PRIMARY.map((id) => {
                  const c = row.cells[id];
                  return (
                    <td key={id} className={`px-4 py-3 align-top leading-relaxed ${highlight === id ? 'bg-red-50/60' : ''}`}>
                      {c.rating && (
                        <span className={`mr-1.5 font-bold ${ratingStyle[c.rating]}`} title={ratingMark[c.rating].label}>
                          {ratingMark[c.rating].mark}
                          <span className="sr-only">（{ratingMark[c.rating].label}）</span>
                        </span>
                      )}
                      <RichText text={c.text} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        NIC が複数ある VM は、どのパターンにも追加 NIC（パターン E）を足せます。表は横にスクロールできます。
      </p>
    </section>
  );
}

function PatternDetail({
  id,
  onBack,
  onCompare,
  onStartDiagnosis,
}: {
  id: PrimaryPatternId;
  onBack: () => void;
  onCompare: () => void;
  onStartDiagnosis: () => void;
}) {
  const d = useMemo(() => previewDiagnosis(id), [id]);
  const p = patterns[id];
  const [params, setParams] = usePatternParams(d);
  usePrintOpensDetails();
  const resolved = resolveParams(params);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <button onClick={onBack} className="no-print text-sm text-slate-500 hover:text-slate-800">
        ← パターン一覧
      </button>
      <p className="mt-4 text-sm font-medium text-red-700">パターン {id}</p>
      <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{p.shortName}</h1>
      <p className="mt-2 text-lg text-slate-700">{p.conclusion}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReachBadge reachable={p.guestIpReachable} />
        <span className="text-xs text-slate-500">{p.name}</span>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        <span className="font-medium text-slate-700">向いている VM:</span> {fitsFor[id]}
      </p>

      <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
        <Diagram
          pattern={id}
          clientsOutside={d.defaults.clientsOutside}
          vlanId={resolved.vlanId}
          subnet={resolved.subnet}
          linuxBridgeName={resolved.linuxBridgeName}
          physicalNetworkName={resolved.physicalNetworkName}
        />
      </div>

      <div className="no-print mt-5 flex flex-wrap gap-2">
        <Button onClick={() => document.getElementById('yaml')?.scrollIntoView({ behavior: 'smooth' })}>YAML を見る ↓</Button>
        <Button variant="secondary" onClick={onCompare}>
          他のパターンと比較する
        </Button>
        <Button variant="ghost" onClick={onStartDiagnosis}>
          自分の VM がこれになるか診断する
        </Button>
      </div>

      <section className="mt-8 space-y-3">
        <PatternAccordions d={d} openOverview />
      </section>

      <YamlSection d={d} params={params} onParamsChange={setParams} />

      <DocsFooter />
    </div>
  );
}
