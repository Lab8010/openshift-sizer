import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateSizing } from './domain/calc';
import { buildExport, parseImport, type InputMode } from './domain/jsonio';
import { fieldDomId } from './domain/parse';
import { largeSampleInput, sampleInput } from './domain/sample';
import { emptySimple, parseSimple, sampleSimple, simpleHasContent, simpleToSizingInput, type SimpleInput } from './domain/simple';
import { buildSimpleView } from './domain/simpleView';
import { DISCLAIMER, PRODUCT } from './domain/sources';
import { emptyInput, type SizingInput } from './domain/types';
import { ErrorsContext, NaDatalist } from './ui/fields';
import { InputForm } from './ui/InputForm';
import { Button } from './ui/kit';
import { PrintReport } from './ui/PrintReport';
import { ResultsView } from './ui/ResultsView';
import { SimpleResultView } from './ui/SimpleResultView';
import { SizingWizard } from './ui/SizingWizard';
import { SourcesPage } from './ui/SourcesPage';
import { TopPage } from './ui/TopPage';

const STORAGE_KEY = 'openshift-sizing-4.22-state';
const LEGACY_KEY = 'openshift-sizing-4.22-input';

type View = 'top' | 'wizard' | 'result' | 'detail' | 'sources';

interface InitState {
  view: View;
  step: number;
  print: boolean;
  simple: SimpleInput;
  detail: SizingInput;
}

function initialState(): InitState {
  const params = new URLSearchParams(window.location.search);
  const st: InitState = { view: 'top', step: 0, print: params.get('view') === 'report', simple: emptySimple(), detail: emptyInput() };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as { simple?: unknown; detail?: unknown };
      const s = parseSimple(data.simple);
      if (s) st.simple = s;
      if (data.detail) {
        const r = parseImport(JSON.stringify(data.detail));
        if (r.ok) st.detail = r.input;
      }
    } else {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const r = parseImport(legacy);
        if (r.ok) st.detail = r.input;
      }
    }
  } catch {
    // 保存データが読めない場合は空の入力で開始
  }
  const mode = params.get('mode');
  const sample = params.get('sample');
  if (mode === 'detail') st.view = 'detail';
  if (sample === 'large') {
    st.view = 'detail';
    st.detail = largeSampleInput();
  } else if (sample) {
    if (st.view === 'detail') st.detail = sampleInput();
    else {
      st.simple = sampleSimple();
      st.view = 'result';
    }
  }
  const view = params.get('view');
  if (view === 'wizard' || view === 'result' || view === 'sources') st.view = view;
  const step = Number(params.get('step'));
  if (Number.isInteger(step) && step > 0) st.step = step - 1;
  return st;
}

export default function App() {
  const init = useMemo(initialState, []);
  const [view, setView] = useState<View>(init.view);
  const [step, setStep] = useState(init.step);
  const [simple, setSimple] = useState<SimpleInput>(init.simple);
  const [input, setInput] = useState<SizingInput>(init.detail);
  const [tab, setTab] = useState<'input' | 'result'>('input');
  const [printView, setPrintView] = useState(init.print);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; details?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mode: InputMode = view === 'detail' ? 'detail' : 'simple';
  // 簡易版は詳細版の入力モデルへ変換し、同じロジックで計算する
  const effectiveInput = useMemo(() => (mode === 'simple' ? simpleToSizingInput(simple) : input), [mode, simple, input]);
  const { result, errors } = useMemo(() => calculateSizing(effectiveInput), [effectiveInput]);
  const simpleView = useMemo(() => buildSimpleView(simple, mode === 'simple' ? result : calculateSizing(simpleToSizingInput(simple)).result), [simple, mode, result]);
  const errorMap = useMemo(() => {
    const m = new Map<string, string>();
    errors.forEach((e) => {
      if (!m.has(e.path)) m.set(e.path, e.message);
    });
    return m;
  }, [errors]);

  const update = useCallback((fn: (d: SizingInput) => void) => {
    setInput((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.isSample = prev.isSample;
      return next;
    });
  }, []);
  const updateSimple = useCallback((fn: (d: SimpleInput) => void) => {
    setSimple((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.isSample = prev.isSample;
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      // 入力はこのブラウザ内だけに保存する（外部へは送信しない）
      const detail = buildExport(input, calculateSizing(input).result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ simple, detail }));
    } catch {
      // 保存できなくても計算は続ける
    }
  }, [simple, input]);

  const go = (v: View) => {
    setView(v);
    setMessage(null);
    window.scrollTo({ top: 0 });
  };

  const start = () => {
    if (simpleHasContent(simple) && !simple.isSample && !window.confirm('前回の入力を消して、新しくはじめますか？')) return;
    setSimple(emptySimple());
    setStep(0);
    go('wizard');
  };

  const openPrint = () => {
    setPrintView(true);
    // 印刷用ビューを描画してから印刷ダイアログを開く
    setTimeout(() => window.print(), 300);
  };

  const exportJson = () => {
    const file = buildExport(effectiveInput, result, new Date(), mode === 'simple' ? simple : undefined);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const name = (effectiveInput.cluster.projectName || 'openshift-sizing').replace(/[\\/:*?"<>|\s]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_sizing_4.22_${mode}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage({ kind: 'ok', text: 'JSON を書き出しました。' });
  };

  const importJson = async (file: File) => {
    const r = parseImport(await file.text());
    if (!r.ok) {
      setMessage({ kind: 'error', text: 'JSON を読み込めませんでした。現在の入力はそのままです。', details: r.errors });
      return;
    }
    if (r.mode === 'simple' && r.simple) {
      setSimple(r.simple);
      setView('result');
    } else {
      setInput(r.input);
      setView('detail');
    }
    setMessage({ kind: 'ok', text: `「${file.name}」を読み込み、現在の計算ロジックで再計算しました。`, details: r.warnings });
  };

  const toDetail = () => {
    if (simpleHasContent(simple) && window.confirm('簡易版の回答を詳細入力に取り込みますか？（「キャンセル」で詳細入力の前回の内容を表示）')) {
      setInput(simpleToSizingInput(simple));
      setTab('input');
    }
    go('detail');
  };

  const focusField = (path: string) => {
    setTab('input');
    setTimeout(() => {
      const el = document.getElementById(fieldDomId(path)) ?? document.getElementById(fieldDomId(path + '.unit'));
      if (!el) return;
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        if (p instanceof HTMLDetailsElement) p.open = true;
        p = p.parentElement;
      }
      el.focus();
      el.scrollIntoView({ block: 'center' });
    }, 0);
  };

  if (printView) {
    return (
      <div className="legacy print-view">
        <div className="print-toolbar noprint">
          <button type="button" onClick={() => setPrintView(false)}>
            ← 画面に戻る
          </button>
          <button type="button" onClick={() => window.print()}>
            印刷／PDF 保存
          </button>
          <span>印刷ダイアログで送信先を「PDF に保存」、用紙サイズを A4 にしてください。</span>
        </div>
        <PrintReport input={effectiveInput} result={result} simple={mode === 'simple' ? { input: simple, view: simpleView } : undefined} />
      </div>
    );
  }

  const navClass = (active: boolean) => `rounded-md px-3 py-1.5 ${active ? 'bg-slate-100 font-medium' : 'text-slate-600 hover:bg-slate-50'}`;

  return (
    <ErrorsContext.Provider value={errorMap}>
      <NaDatalist />
      <div className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-1.5">
          本文へ移動
        </a>
        <header className="no-print border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <button type="button" onClick={() => go('top')} className="text-left">
              <span className="block text-sm font-bold text-slate-900">OpenShift Sizer</span>
              <span className="hidden text-xs text-slate-500 sm:block">OpenShift Virtualization 4.22 のノードサイジング</span>
            </button>
            <nav className="-mx-3 flex w-full shrink-0 gap-1 whitespace-nowrap text-sm sm:mx-0 sm:ml-auto sm:w-auto" aria-label="メイン">
              <button type="button" onClick={() => go(simpleHasContent(simple) ? 'result' : 'wizard')} className={navClass(view === 'wizard' || view === 'result')}>
                サイジング
              </button>
              <button type="button" onClick={toDetail} className={navClass(view === 'detail')}>
                詳細入力
              </button>
              <button type="button" onClick={() => go('sources')} className={navClass(view === 'sources')}>
                前提・出典
              </button>
            </nav>
          </div>
        </header>
        <div className="no-print border-b border-slate-200 bg-slate-50">
          <p className="mx-auto max-w-5xl px-4 py-2 text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-700">{DISCLAIMER.title}：</span>
            {DISCLAIMER.text}
          </p>
        </div>

        {message && (
          <div className={`mx-auto mt-4 w-full max-w-5xl px-4`} role={message.kind === 'error' ? 'alert' : 'status'}>
            <div className={`rounded-xl border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
              <p>{message.text}</p>
              {message.details?.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {message.details.slice(0, 20).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className="mt-1 underline" onClick={() => setMessage(null)}>
                閉じる
              </button>
            </div>
          </div>
        )}

        <main id="main" className="flex-1">
          {view === 'top' && (
            <TopPage
              hasPrevious={simpleHasContent(simple) && !simple.isSample}
              onStart={start}
              onResume={() => go('result')}
              onSample={() => {
                setSimple(sampleSimple());
                go('result');
              }}
              onDetail={toDetail}
              onImport={() => fileRef.current?.click()}
            />
          )}
          {view === 'wizard' && <SizingWizard simple={simple} update={updateSimple} index={step} onIndexChange={setStep} onDone={() => go('result')} onExit={() => go('top')} />}
          {view === 'result' && (
            <SimpleResultView
              result={result}
              view={simpleView}
              simple={simple}
              update={updateSimple}
              onEdit={() => {
                setStep(0);
                go('wizard');
              }}
              onRestart={start}
              onPrint={openPrint}
              onExport={exportJson}
              onDetail={toDetail}
            />
          )}
          {view === 'sources' && <SourcesPage result={result} />}
          {view === 'detail' && (
            <div className="detail-view mx-auto max-w-6xl">
              <div className="px-5 pt-6">
                <p className="text-sm font-medium text-red-700">詳細入力</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">ネットワーク・ストレージ性能・実測値まで入力して見積もる</h1>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setInput(sampleInput())}>
                    サンプルを読み込む
                  </Button>
                  <Button variant="secondary" onClick={() => setInput(largeSampleInput())}>
                    大きなサンプル
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm('詳細入力の内容をすべて消去しますか？')) setInput(emptyInput());
                    }}
                  >
                    新規
                  </Button>
                  <Button variant="secondary" onClick={exportJson}>
                    JSON を保存
                  </Button>
                  <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                    JSON を読み込む
                  </Button>
                  <Button onClick={openPrint}>印刷／PDF 保存</Button>
                </div>
                {input.isSample && <p className="mt-3 text-sm text-amber-900">サンプル値を表示しています。公式値ではありません。</p>}
              </div>
              <div className="legacy">
              {errors.length > 0 && (
                <div className="error-summary page-pad" role="region" aria-labelledby="err-h">
                  <h2 id="err-h">入力エラー（{errors.length} 件）</h2>
                  <ul>
                    {errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        <button type="button" className="link" onClick={() => focusField(e.path)}>
                          {e.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="tabs" role="tablist" aria-label="表示の切り替え">
                <button type="button" role="tab" id="tab-input" aria-selected={tab === 'input'} aria-controls="panel-input" onClick={() => setTab('input')}>
                  入力
                  {errors.length > 0 && <span className="count">エラー {errors.length}</span>}
                </button>
                <button type="button" role="tab" id="tab-result" aria-selected={tab === 'result'} aria-controls="panel-result" onClick={() => setTab('result')}>
                  結果
                  {result.openItems.length > 0 && <span className="count muted">確認 {result.openItems.length}</span>}
                </button>
              </div>
              <div className="detail-main">
                <div role="tabpanel" id="panel-input" aria-labelledby="tab-input" hidden={tab !== 'input'}>
                  <InputForm input={input} update={update} />
                  <p className="to-result">
                    <button type="button" className="primary" onClick={() => setTab('result')}>
                      結果を見る
                    </button>
                  </p>
                </div>
                <div role="tabpanel" id="panel-result" aria-labelledby="tab-result" hidden={tab !== 'result'}>
                  <ResultsView result={result} />
                </div>
              </div>
              </div>
            </div>
          )}
        </main>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />

        <footer className="no-print border-t border-slate-200 bg-white">
          <p className="mx-auto max-w-5xl px-4 py-3 text-xs text-slate-500">
            前提: {PRODUCT.ocp} / {PRODUCT.virt} / OVN-Kubernetes。入力はブラウザ内だけで計算し、外部へは送信しません。
          </p>
        </footer>
      </div>
    </ErrorsContext.Provider>
  );
}
