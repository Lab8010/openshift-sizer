import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { glossary } from '../data/glossary';

/** 折りたたみ（デフォルト閉）。印刷時は ResultView 側で全部開く */
export function Accordion({
  title,
  children,
  meta,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={defaultOpen || undefined}>
      <summary className="flex items-center gap-3 px-5 py-4 font-medium text-slate-800 hover:bg-slate-50 rounded-xl">
        <span className="chevron inline-block text-slate-400 transition-transform" aria-hidden>
          ▸
        </span>
        <span className="flex-1">{title}</span>
        {meta && <span className="text-sm font-normal text-slate-500">{meta}</span>}
      </summary>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </details>
  );
}

// ---- 用語の解説ポップアップ ----

const aliasToDef = new Map<string, { term: string; definition: string }>();
for (const g of glossary) for (const a of g.aliases) aliasToDef.set(a, { term: g.term, definition: g.definition });
const escaped = [...aliasToDef.keys()]
  .sort((a, b) => b.length - a.length)
  .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const termRegex = new RegExp(`(?<![A-Za-z-])(${escaped.join('|')})(?![A-Za-z-])`, 'g');

interface PopPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

/**
 * クリックで解説をポップアップ表示する用語。
 * 選択肢カードの中に置いても、クリックがカードの選択として扱われないようにイベントを止める。
 */
function Term({ alias, term, definition }: { alias: string; term: string; definition: string }) {
  const [pos, setPos] = useState<PopPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const open = () => {
    const r = btnRef.current!.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    // 下に入りきらなければ上に出す
    setPos(
      r.bottom + 180 > window.innerHeight
        ? { left, width, bottom: window.innerHeight - r.top + 6 }
        : { left, width, top: r.bottom + 6 },
    );
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        btnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  // ポータル経由でも React のイベントは親（選択肢カード）へ伝わるので、ここで止める
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="term"
        aria-expanded={!!pos}
        aria-controls={pos ? popId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) setPos(null);
          else open();
        }}
        onKeyDown={stop}
      >
        {alias}
      </button>
      {pos &&
        createPortal(
          <div
            id={popId}
            ref={popRef}
            role="dialog"
            aria-label={`用語の解説: ${term}`}
            onClick={stop}
            onKeyDown={stop}
            className="fixed z-50 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm leading-relaxed text-slate-700 shadow-xl"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-slate-900">{term}</span>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => {
                  setPos(null);
                  btnRef.current?.focus();
                }}
                className="-mr-1 -mt-1 rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <p className="mt-1.5">{definition}</p>
          </div>,
          document.body,
        )}
    </>
  );
}

/** 本文中の専門用語を、クリックで解説が開く用語にする（各用語は最初の 1 回だけ） */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(termRegex)) {
    const alias = m[1];
    const entry = aliasToDef.get(alias)!;
    if (seen.has(entry.term)) continue;
    seen.add(entry.term);
    const i = m.index ?? 0;
    parts.push(text.slice(last, i));
    parts.push(<Term key={i} alias={alias} term={entry.term} definition={entry.definition} />);
    last = i + alias.length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  className = '',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-300',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** ゲスト IP が宛先になる / ならない（色だけでなくラベルと記号でも区別する） */
export function ReachBadge({ reachable }: { reachable: boolean }) {
  return reachable ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
      ✓ ゲスト IP が宛先になる
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
      ✕ ゲスト IP は宛先にならない
    </span>
  );
}
