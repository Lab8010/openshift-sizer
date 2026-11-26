import type { Answers, Diagnosis, PrimaryPatternId } from '../data/types';
import { patterns } from '../data/patterns';
import { qLabel } from '../data/questions';
import { resolveParams } from '../lib/generateYaml';
import { Diagram } from './Diagram';
import { DocsFooter, PatternAccordions, YamlSection, usePatternParams, usePrintOpensDetails } from './PatternSections';
import { Accordion, Button, ReachBadge, RichText } from './ui';

interface Props {
  diagnosis: Diagnosis;
  answers: Answers;
  onRestart: () => void;
  onEdit: () => void;
  onCompare: (highlight: PrimaryPatternId) => void;
}

export function ResultView({ diagnosis: d, onRestart, onEdit, onCompare }: Props) {
  const p = patterns[d.primary];
  const [params, setParams] = usePatternParams(d);
  usePrintOpensDetails();
  const resolved = resolveParams(params);
  const topReasons = d.reasons.slice(0, 3);
  const moreReasons = d.reasons.slice(3);
  const hasE = d.modifiers.includes('E');

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      {/* ---- ファーストビュー: 結論 + 構成図 + 理由 3 件 + YAML ボタン ---- */}
      <section>
        <p className="text-sm font-medium text-red-700">診断結果</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">
          あなたの構成は「パターン {p.id}: {p.shortName}」です
        </h1>
        <p className="mt-2 text-lg text-slate-700">{p.conclusion}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ReachBadge reachable={p.guestIpReachable} />
          {hasE && (
            <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
              ＋ パターン E: マルチホーム（追加 NIC 分も生成）
            </span>
          )}
          <span className="text-xs text-slate-500">{p.name}</span>
        </div>

        <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
          <Diagram
            pattern={d.primary}
            multihome={hasE}
            clientsOutside={d.defaults.clientsOutside}
            vlanId={resolved.vlanId}
            subnet={resolved.subnet}
            linuxBridgeName={resolved.linuxBridgeName}
            physicalNetworkName={resolved.physicalNetworkName}
            secondaryNetworkName={resolved.secondaryNetworkName}
          />
        </div>

        <h2 className="mt-6 font-bold text-slate-900">なぜこの構成か</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {topReasons.map((r, i) => (
            <li key={i} className="rounded-xl bg-white p-4 text-sm leading-relaxed ring-1 ring-slate-200">
              <span className="block text-slate-500">
                {qLabel(r.questionId)} で「{r.answerLabel}」と答えたため
              </span>
              <span className="mt-1 block text-slate-800">
                → <RichText text={r.text} />
              </span>
            </li>
          ))}
        </ol>
        {moreReasons.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
              <span className="chevron inline-block transition-transform" aria-hidden>
                ▸
              </span>
              ほかの理由（{moreReasons.length} 件）
            </summary>
            <ol className="mt-2 grid gap-2 md:grid-cols-2">
              {moreReasons.map((r, i) => (
                <li key={i} className="rounded-lg bg-white p-3 leading-relaxed ring-1 ring-slate-200">
                  <span className="text-slate-500">
                    {qLabel(r.questionId)}「{r.answerLabel}」
                  </span>
                  <span className="block">
                    → <RichText text={r.text} />
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className="no-print mt-5 flex flex-wrap gap-2">
          <Button onClick={() => document.getElementById('yaml')?.scrollIntoView({ behavior: 'smooth' })}>
            YAML を見る ↓
          </Button>
          <Button variant="secondary" onClick={() => onCompare(d.primary)}>
            他のパターンと比較する
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            回答を直す
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            最初からやり直す
          </Button>
        </div>
      </section>

      {/* ---- 満たせない要件・注意 ---- */}
      {d.warnings.length > 0 && (
        <section className="mt-8 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-5 py-4" aria-label="注意">
          <h2 className="font-bold text-amber-950">注意</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-amber-950">
            {d.warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>⚠</span>
                <span>
                  <RichText text={w} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- 詳細（すべて折りたたみ・デフォルト閉） ---- */}
      <section className="mt-8 space-y-3">
        <PatternAccordions d={d} />

        {d.alternatives.length > 0 && (
          <Accordion title="代替案" meta={d.alternatives.map((a) => `パターン ${a}`).join('・')}>
            <ul className="space-y-3 text-sm">
              {d.alternatives.map((a) => (
                <li key={a} className="rounded-lg bg-slate-50 p-3">
                  <span className="font-semibold">
                    パターン {a}: {patterns[a].shortName}
                  </span>
                  <span className="ml-2 text-slate-500">{patterns[a].conclusion}</span>
                  <span className="mt-1 block text-slate-700">→ {patterns[a].whenToChoose}</span>
                </li>
              ))}
            </ul>
          </Accordion>
        )}

        {d.exceptionNote === 'F' && (
          <Accordion title="例外枠: SR-IOV（検討メモ）">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {patterns.F.points.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Accordion>
        )}
      </section>

      <YamlSection d={d} params={params} onParamsChange={setParams} />

      <DocsFooter />
    </div>
  );
}
