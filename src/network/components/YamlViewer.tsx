import { useState, type ReactNode } from 'react';
import type { YamlFile } from '../lib/generateYaml';
import { Button } from './ui';

interface Props {
  files: YamlFile[];
  combined: string;
  downloadName: string;
}

/** 軽量な YAML ハイライト（コメント / キー / 文字列 / 区切り） */
function highlightLine(line: string, key: number): ReactNode {
  if (/^---\s*$/.test(line)) return <span key={key} className="text-slate-500">{line}</span>;
  // 引用符の外にある最初の「 #」以降をコメントとして扱う
  let commentAt = -1;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      commentAt = i;
      break;
    }
  }
  const body = commentAt >= 0 ? line.slice(0, commentAt) : line;
  const comment = commentAt >= 0 ? line.slice(commentAt) : '';
  const m = body.match(/^(\s*(?:-\s+)?)("?[\w./-]+"?)(:)(.*)$/);
  const value = (v: string) =>
    v.trim().startsWith('"') ? <span className="text-emerald-300">{v}</span> : <span className="text-sky-200">{v}</span>;
  return (
    <span key={key}>
      {m ? (
        <>
          {m[1]}
          <span className="text-rose-300">{m[2]}</span>
          <span className="text-slate-400">{m[3]}</span>
          {value(m[4])}
        </>
      ) : (
        value(body)
      )}
      {comment && <span className="italic text-slate-400">{comment}</span>}
    </span>
  );
}

function Code({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-b-xl bg-slate-900 p-4 font-mono text-[13px] leading-relaxed text-slate-100">
      <code>
        {lines.map((l, i) => (
          <span key={i}>
            {highlightLine(l, i)}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-yaml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function YamlViewer({ files, combined, downloadName }: Props) {
  const [tab, setTab] = useState<string>('all');
  const [copied, setCopied] = useState<string | null>(null);
  const active = files.find((f) => f.id === tab);
  const text = active ? active.content : combined;

  const onCopy = async (id: string, t: string) => {
    if (await copyText(t)) {
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    }
  };

  const tabs = [{ id: 'all', title: 'すべて', reference: false }, ...files];

  return (
    <div className="rounded-xl ring-1 ring-slate-300">
      <div className="no-print flex flex-wrap items-center gap-2 rounded-t-xl border-b border-slate-700 bg-slate-800 px-3 py-2">
        <div role="tablist" aria-label="YAML ファイル" className="flex flex-1 flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === t.id ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-700'
              } ${t.reference ? 'italic' : ''}`}
            >
              {t.title}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="!px-3 !py-1.5 !text-xs"
            onClick={() => onCopy(tab, text)}
          >
            {copied === tab ? '✓ コピーしました' : active ? 'このファイルをコピー' : 'すべてコピー'}
          </Button>
          <Button className="!px-3 !py-1.5 !text-xs" onClick={() => download(active ? active.filename : downloadName, text)}>
            ↓ {active ? active.filename : downloadName}
          </Button>
        </div>
      </div>
      {active?.reference && (
        <p className="bg-amber-50 px-4 py-2 text-xs text-amber-900">
          参考扱いです。「すべて」の一括 YAML には含めていません。
        </p>
      )}
      <Code text={text} />
    </div>
  );
}
