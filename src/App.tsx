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
import { PrintReport } from './ui/PrintReport';
import { ResultsView } from './ui/ResultsView';
import { SimpleForm } from './ui/SimpleForm';
import { SimpleResults } from './ui/SimpleResults';

const STORAGE_KEY = 'openshift-sizing-4.22-state';
const LEGACY_KEY = 'openshift-sizing-4.22-input';

interface InitState {
  mode: InputMode;
  simple: SimpleInput;
  detail: SizingInput;
  view: 'app' | 'report';
}

function initialState(): InitState {
  const params = new URLSearchParams(window.location.search);
  const sample = params.get('sample');
  const view = params.get('view') === 'report' ? 'report' : 'app';
  const st: InitState = { mode: 'simple', simple: emptySimple(), detail: emptyInput(), view };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as { mode?: unknown; simple?: unknown; detail?: unknown };
      const s = parseSimple(data.simple);
      if (s) st.simple = s;
      if (data.detail) {
        const r = parseImport(JSON.stringify(data.detail));
        if (r.ok) st.detail = r.input;
      }
      if (data.mode === 'detail') st.mode = 'detail';
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
  if (mode === 'detail' || mode === 'simple') st.mode = mode;
  if (sample === 'large') {
    st.mode = 'detail';
    st.detail = largeSampleInput();
  } else if (sample) {
    if (st.mode === 'simple') st.simple = sampleSimple();
    else st.detail = sampleInput();
  }
  return st;
}

export default function App() {
  const init = useMemo(initialState, []);
  const [mode, setMode] = useState<InputMode>(init.mode);
  const [simple, setSimple] = useState<SimpleInput>(init.simple);
  const [input, setInput] = useState<SizingInput>(init.detail);
  const [tab, setTab] = useState<'input' | 'result'>(() => (new URLSearchParams(window.location.search).get('tab') === 'result' ? 'result' : 'input'));
  const [printView, setPrintView] = useState(init.view === 'report');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; details?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 表示中のモードの入力から計算する（簡易版は詳細版の入力モデルへ変換して同じロジックで計算）
  const effectiveInput = useMemo(() => (mode === 'simple' ? simpleToSizingInput(simple) : input), [mode, simple, input]);
  const { result, errors } = useMemo(() => calculateSizing(effectiveInput), [effectiveInput]);
  const simpleView = useMemo(() => (mode === 'simple' ? buildSimpleView(simple, result) : null), [mode, simple, result]);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, simple, detail }));
    } catch {
      // 保存できなくても計算は続ける
    }
  }, [mode, simple, input]);

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
    a.download = `${name}_sizing_4.22_${mode === 'simple' ? 'simple' : 'detail'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage({ kind: 'ok', text: `JSON（${mode === 'simple' ? '簡易版' : '詳細版'}）を書き出しました。` });
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    const r = parseImport(text);
    if (!r.ok) {
      setMessage({ kind: 'error', text: 'JSON を読み込めませんでした。現在の入力はそのままです。', details: r.errors });
      return;
    }
    if (r.mode === 'simple' && r.simple) {
      setSimple(r.simple);
      setMode('simple');
    } else {
      setInput(r.input);
      setMode('detail');
    }
    setMessage({ kind: 'ok', text: `「${file.name}」を${r.mode === 'simple' ? '簡易版' : '詳細版'}として読み込み、現在の計算ロジックで再計算しました。`, details: r.warnings });
  };

  const importSimpleToDetail = () => {
    if (!window.confirm('簡易版の入力で詳細版の入力を置き換えます。よろしいですか？')) return;
    setInput(simpleToSizingInput(simple));
    setMessage({ kind: 'ok', text: '簡易版の入力を詳細版に取り込みました。簡易版の仮定値も詳細版の各項目に入っています。' });
  };

  const focusField = (path: string) => {
    setTab('input');
    setTimeout(() => {
      const el = document.getElementById(fieldDomId(path)) ?? document.getElementById(fieldDomId(path + '.unit'));
      if (el) {
        // 閉じた details の中にある場合は開く
        let p: HTMLElement | null = el.parentElement;
        while (p) {
          if (p instanceof HTMLDetailsElement) p.open = true;
          p = p.parentElement;
        }
        el.focus();
        el.scrollIntoView({ block: 'center' });
      }
    }, 0);
  };

  if (printView) {
    return (
      <div className="print-view">
        <div className="print-toolbar noprint">
          <button type="button" onClick={() => setPrintView(false)}>
            ← 入力画面に戻る
          </button>
          <button type="button" onClick={() => window.print()}>
            印刷／PDF 保存
          </button>
          <span>印刷ダイアログで送信先を「PDF に保存」、用紙サイズを A4 にしてください。</span>
        </div>
        <PrintReport input={effectiveInput} result={result} simple={mode === 'simple' && simpleView ? { input: simple, view: simpleView } : undefined} />
      </div>
    );
  }

  const isSample = mode === 'simple' ? simple.isSample : input.isSample;

  return (
    <ErrorsContext.Provider value={errorMap}>
      <NaDatalist />
      <a className="skip" href="#main">
        本文へ移動
      </a>
      <header className="app-header">
        <div>
          <h1>OpenShift サイジング</h1>
          <p className="sub">
            {PRODUCT.ocp}／{PRODUCT.virt}・ブラウザ内で完結（入力は外部へ送信しません）
          </p>
        </div>
        <div className="mode-switch" role="group" aria-label="入力モード">
          <button type="button" aria-pressed={mode === 'simple'} onClick={() => setMode('simple')}>
            簡易版
          </button>
          <button type="button" aria-pressed={mode === 'detail'} onClick={() => setMode('detail')}>
            詳細版
          </button>
        </div>
        <nav className="toolbar" aria-label="操作">
          {mode === 'simple' ? (
            <button type="button" onClick={() => setSimple(sampleSimple())}>
              サンプルを読み込む
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setInput(sampleInput())}>
                サンプルを読み込む
              </button>
              <button type="button" onClick={() => setInput(largeSampleInput())}>
                大きなサンプル
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`${mode === 'simple' ? '簡易版' : '詳細版'}の入力をすべて消去して新規に始めますか？`)) return;
              if (mode === 'simple') setSimple(emptySimple());
              else setInput(emptyInput());
            }}
          >
            新規
          </button>
          <button type="button" onClick={exportJson}>
            JSON を保存
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            JSON を読み込む
          </button>
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
          <button type="button" className="primary" onClick={openPrint}>
            印刷／PDF 保存
          </button>
        </nav>
      </header>
      <aside className="disclaimer" aria-labelledby="disclaimer-h">
        <strong id="disclaimer-h">{DISCLAIMER.title}：</strong>
        {DISCLAIMER.text}
      </aside>
      {isSample && (
        <p className="sample-banner" role="note">
          サンプル値を表示しています。公式値ではありません。
        </p>
      )}
      {message && (
        <div className={`message message-${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          <p>{message.text}</p>
          {message.details?.length ? (
            <ul>
              {message.details.slice(0, 20).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="link" onClick={() => setMessage(null)}>
            閉じる
          </button>
        </div>
      )}
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

      {mode === 'simple' && simpleView ? (
        <main id="main" className="simple-layout">
          <div className="simple-input">
            <p className="lead">
              VM の台数とサイズ、VM 用の物理サーバの台数と仕様を入れると、必要な台数とコントロールプレーン・インフラの目安を表示します。ネットワークやストレージ性能、実測値を含めて見積もる場合は「詳細版」を使ってください。
            </p>
            <SimpleForm simple={simple} update={updateSimple} />
          </div>
          <div className="simple-output">
            <SimpleResults result={result} view={simpleView} />
          </div>
        </main>
      ) : (
        <>
          {simpleHasContent(simple) && (
            <div className="import-banner page-pad">
              簡易版で入力した内容を詳細版の出発点にできます。
              <button type="button" onClick={importSimpleToDetail}>
                簡易版の入力を詳細版に取り込む
              </button>
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
          <main id="main">
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
          </main>
        </>
      )}
    </ErrorsContext.Provider>
  );
}
