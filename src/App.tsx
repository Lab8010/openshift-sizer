import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateSizing } from './domain/calc';
import { buildExport, parseImport } from './domain/jsonio';
import { fieldDomId } from './domain/parse';
import { largeSampleInput, sampleInput } from './domain/sample';
import { DISCLAIMER, PRODUCT } from './domain/sources';
import { emptyInput, type SizingInput } from './domain/types';
import { ErrorsContext, NaDatalist } from './ui/fields';
import { InputForm } from './ui/InputForm';
import { PrintReport } from './ui/PrintReport';
import { ResultsView } from './ui/ResultsView';

const STORAGE_KEY = 'openshift-sizing-4.22-input';

function initialInput(): { input: SizingInput; view: 'app' | 'report' } {
  const params = new URLSearchParams(window.location.search);
  const sample = params.get('sample');
  const view = params.get('view') === 'report' ? 'report' : 'app';
  if (sample === 'large') return { input: largeSampleInput(), view };
  if (sample) return { input: sampleInput(), view };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const r = parseImport(saved);
      if (r.ok) return { input: r.input, view };
    }
  } catch {
    // 保存データが読めない場合は空の入力で開始
  }
  return { input: emptyInput(), view };
}

export default function App() {
  const init = useMemo(initialInput, []);
  const [input, setInput] = useState<SizingInput>(init.input);
  const [tab, setTab] = useState<'input' | 'result'>(() => (new URLSearchParams(window.location.search).get('tab') === 'result' ? 'result' : 'input'));
  const [printView, setPrintView] = useState(init.view === 'report');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; details?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const { result, errors } = useMemo(() => calculateSizing(input), [input]);
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

  useEffect(() => {
    try {
      // 入力はこのブラウザ内だけに保存する（外部へは送信しない）
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildExport(input, result)));
    } catch {
      // 保存できなくても計算は続ける
    }
  }, [input, result]);

  const openPrint = () => {
    setPrintView(true);
    // 印刷用ビューを描画してから印刷ダイアログを開く
    setTimeout(() => window.print(), 300);
  };

  const exportJson = () => {
    const file = buildExport(input, result);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const name = (input.cluster.projectName || 'openshift-sizing').replace(/[\\/:*?"<>|\s]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_sizing_4.22.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage({ kind: 'ok', text: 'JSON を書き出しました。' });
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    const r = parseImport(text);
    if (!r.ok) {
      setMessage({ kind: 'error', text: 'JSON を読み込めませんでした。現在の入力はそのままです。', details: r.errors });
      return;
    }
    setInput(r.input);
    setMessage({ kind: 'ok', text: `「${file.name}」を読み込み、現在の計算ロジックで再計算しました。`, details: r.warnings });
  };

  const focusField = (path: string) => {
    setTab('input');
    setTimeout(() => {
      const el = document.getElementById(fieldDomId(path)) ?? document.getElementById(fieldDomId(path + '.unit'));
      if (el) {
        // 詳細行が閉じている場合に備えて親の details を開く
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
        <PrintReport input={input} result={result} />
      </div>
    );
  }

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
        <nav className="toolbar" aria-label="操作">
          <button type="button" onClick={() => setInput(sampleInput())}>
            サンプルを読み込む
          </button>
          <button type="button" onClick={() => setInput(largeSampleInput())}>
            大きなサンプル
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('入力をすべて消去して新規に始めますか？')) setInput(emptyInput());
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
      {input.isSample && (
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
        {errors.length > 0 && (
          <div className="error-summary" ref={errorSummaryRef} role="region" aria-labelledby="err-h" tabIndex={-1}>
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
    </ErrorsContext.Provider>
  );
}
