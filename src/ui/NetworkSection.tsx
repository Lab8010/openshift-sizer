// ネットワーク構成診断（旧 OpenShift VM Network Advisor）を Sizer の中で表示する。
import { useState } from 'react';
import { computePath } from '../network/data/questions';
import type { Answers, PrimaryPatternId } from '../network/data/types';
import { Glossary } from '../network/components/Glossary';
import { PatternsPage } from '../network/components/PatternsPage';
import { ResultView } from '../network/components/ResultView';
import { Wizard } from '../network/components/Wizard';
import type { NetworkState } from '../domain/networkLink';
import { Button } from './kit';

export type NetView = 'intro' | 'wizard' | 'result' | 'patterns' | 'learn';

interface Props {
  network: NetworkState;
  onAnswersChange: (a: Answers) => void;
  view: NetView;
  onViewChange: (v: NetView) => void;
  index: number;
  onIndexChange: (i: number) => void;
  hasSizing: boolean;
  onToSizing: () => void;
}

export function NetworkSection({ network, onAnswersChange, view, onViewChange, index, onIndexChange, hasSizing, onToSizing }: Props) {
  const [pattern, setPattern] = useState<{ selected: PrimaryPatternId | null; highlight?: PrimaryPatternId; focusCompare?: boolean }>({ selected: null });
  const answers = network.answers;

  const go = (v: NetView) => {
    onViewChange(v);
    window.scrollTo({ top: 0 });
  };
  const start = () => {
    onAnswersChange({});
    onIndexChange(0);
    go('wizard');
  };
  const openDiagnosis = () => {
    if (Object.keys(answers).length === 0) go('intro');
    else if (network.complete) go('result');
    else go('wizard');
  };
  const openPatterns = (opts: { highlight?: PrimaryPatternId; focusCompare?: boolean } = {}) => {
    setPattern({ selected: null, ...opts });
    onViewChange('patterns');
    if (!opts.focusCompare) window.scrollTo({ top: 0 });
  };
  const tab = (active: boolean) => `rounded-md px-3 py-1.5 ${active ? 'bg-white font-medium text-slate-900 ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white'}`;

  return (
    <div>
      <div className="no-print border-b border-slate-200 bg-slate-100/70">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-2 text-sm" aria-label="ネットワーク診断">
          <span className="mr-2 text-xs font-medium text-slate-500">ネットワーク診断</span>
          <button type="button" onClick={openDiagnosis} className={tab(view === 'intro' || view === 'wizard' || view === 'result')}>
            診断
          </button>
          <button type="button" onClick={() => openPatterns()} className={tab(view === 'patterns')}>
            パターン一覧
          </button>
          <button type="button" onClick={() => go('learn')} className={tab(view === 'learn')}>
            解説・用語集
          </button>
        </nav>
      </div>

      {view === 'intro' && <NetworkIntro onStart={start} onPatterns={() => openPatterns()} onLearn={() => go('learn')} />}
      {view === 'wizard' && (
        <Wizard answers={answers} onAnswersChange={onAnswersChange} index={index} onIndexChange={onIndexChange} onDone={() => go('result')} onExit={() => go('intro')} />
      )}
      {view === 'result' && network.diagnosis && (
        <>
          <SizingLink hasSizing={hasSizing} sriov={network.diagnosis.exceptionNote === 'F'} onToSizing={onToSizing} />
          <ResultView
            key={`${network.diagnosis.primary}-${network.diagnosis.modifiers.join('')}`}
            diagnosis={network.diagnosis}
            answers={answers}
            onRestart={start}
            onEdit={() => {
              onIndexChange(computePath(answers).length - 1);
              go('wizard');
            }}
            onCompare={(highlight) => openPatterns({ highlight, focusCompare: true })}
          />
        </>
      )}
      {view === 'result' && !network.diagnosis && <NetworkIntro onStart={start} onPatterns={() => openPatterns()} onLearn={() => go('learn')} />}
      {view === 'patterns' && (
        <PatternsPage
          selected={pattern.selected}
          highlight={pattern.highlight}
          focusCompare={pattern.focusCompare}
          onSelect={(selected, opts) => setPattern((prev) => ({ ...prev, selected, focusCompare: opts?.focusCompare }))}
          onStartDiagnosis={openDiagnosis}
        />
      )}
      {view === 'learn' && <Glossary onStart={start} />}
    </div>
  );
}

function SizingLink({ hasSizing, sriov, onToSizing }: { hasSizing: boolean; sriov: boolean; onToSizing: () => void }) {
  return (
    <div className="no-print mx-auto max-w-5xl px-4 pt-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <span className="flex-1">
          この診断結果は、サイジング結果と PDF レポートにも表示されます。
          {sriov && ' SR-IOV を使う VM はサイジング結果で選ぶと、VM の追加メモリに反映されます。'}
        </span>
        <Button variant="secondary" onClick={onToSizing}>
          {hasSizing ? 'サイジング結果を見る' : 'サイジングをはじめる'} →
        </Button>
      </div>
    </div>
  );
}

function NetworkIntro({ onStart, onPatterns, onLearn }: { onStart: () => void; onPatterns: () => void; onLearn: () => void }) {
  const link = 'text-red-800 underline underline-offset-2 hover:text-red-900';
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:py-20">
      <p className="text-sm font-medium text-red-700">ネットワーク構成診断</p>
      <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
        その VM、OpenShift では
        <br className="hidden sm:inline" />
        どのネットワークに載せる？
      </h1>
      <ul className="mt-8 space-y-3 text-lg leading-relaxed text-slate-700">
        <li>・vSphere で動いている VM のことを、選択式の質問で答えていくと</li>
        <li>・OpenShift Virtualization で必要なネットワーク構成を 1 つ診断し</li>
        <li>・構成図・理由・コピーして使えるサンプル YAML をその場で出します</li>
      </ul>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Button onClick={onStart} className="!px-8 !py-3.5 !text-base">
          診断をはじめる →
        </Button>
        <span className="text-sm text-slate-500">約 3 分・質問は 5〜10 問（回答で変わります）</span>
      </div>
      <div className="mt-12 space-y-2 text-sm text-slate-500">
        <p>
          先にゴールを見たい方へ:{' '}
          <button type="button" onClick={onPatterns} className={link}>
            構成パターン一覧と比較表
          </button>
        </p>
        <p>
          先に知っておきたい方へ:{' '}
          <button type="button" onClick={onLearn} className={link}>
            Pod Network ではゲスト IP が宛先にならない理由
          </button>
        </p>
      </div>
    </div>
  );
}
