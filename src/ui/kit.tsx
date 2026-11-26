// Network Advisor と同じ見た目の部品（Tailwind）。
import { useContext, type ReactNode } from 'react';
import { fieldDomId } from '../domain/parse';
import { STATUS_LABEL, STATUS_MARK, type Status } from '../domain/result';
import type { Qty } from '../domain/types';
import { ErrorsContext } from './fields';

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** 折りたたみ（既定は閉） */
export function Accordion({ title, children, meta, defaultOpen = false }: { title: ReactNode; children: ReactNode; meta?: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={defaultOpen || undefined}>
      <summary className="flex items-center gap-3 rounded-xl px-5 py-4 font-medium text-slate-800 hover:bg-slate-50">
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

export function Details({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="mt-1 text-sm text-slate-600">
      <summary className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
        <span className="chevron inline-block transition-transform" aria-hidden>
          ▸
        </span>
        {summary}
      </summary>
      <div className="mt-2 rounded-lg bg-white p-4 leading-relaxed ring-1 ring-slate-200">{children}</div>
    </details>
  );
}

/** 選択肢カード（ラジオ）。例と「→ どうなるか」を表示する */
export function OptionCard({
  selected,
  onSelect,
  label,
  example,
  consequence,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: ReactNode;
  example?: ReactNode;
  consequence?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer flex-col rounded-xl border-2 bg-white p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 ${
        selected ? 'border-red-700 shadow-sm' : 'border-slate-200 hover:border-slate-400'
      }`}
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs text-white ${selected ? 'border-red-700 bg-red-700' : 'border-slate-300'}`}
        >
          {selected ? '✓' : ''}
        </span>
        <span className="font-semibold leading-snug text-slate-900">{label}</span>
      </span>
      {example && <span className="mt-2 pl-8 text-sm leading-relaxed text-slate-600">例: {example}</span>}
      {consequence && (
        <span className="mt-auto flex items-start gap-1.5 pl-8 pt-3 text-sm font-medium text-slate-700">
          <span aria-hidden className="text-red-700">
            →
          </span>
          <span>{consequence}</span>
        </span>
      )}
      {children}
    </div>
  );
}

export function UnsureHint({ children }: { children: ReactNode }) {
  return (
    <aside className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
      <span className="font-semibold">迷ったら</span>
      <span className="mx-2 text-sky-300">|</span>
      {children}
    </aside>
  );
}

function useError(path: string): string | undefined {
  const m = useContext(ErrorsContext);
  return m.get(path) ?? m.get(path + '.unit');
}

const inputCls = (err?: string) =>
  `block w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 ${err ? 'border-rose-500' : 'border-slate-300'}`;

/** 数値入力（Tailwind 版）。パスは検証エラーと共通 */
export function TwNumber({
  path,
  label,
  value,
  onChange,
  suffix,
  hint,
  hideLabel,
  className = '',
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: ReactNode;
  hideLabel?: boolean;
  className?: string;
}) {
  const err = useError(path);
  const id = fieldDomId(path);
  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>
        {label}
      </label>
      <div className={`flex items-center gap-2 ${hideLabel ? '' : 'mt-1'}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls(err)} tabular-nums`}
        />
        {suffix && <span className="shrink-0 text-sm text-slate-500">{suffix}</span>}
      </div>
      {err ? (
        <span id={`${id}-err`} className="mt-1 block text-xs text-rose-700">
          {err}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </div>
  );
}

export function TwQty<U extends string>({
  path,
  label,
  value,
  units,
  onChange,
  hint,
  hideLabel,
  className = '',
}: {
  path: string;
  label: string;
  value: Qty<U>;
  units: readonly U[];
  onChange: (v: Qty<U>) => void;
  hint?: ReactNode;
  hideLabel?: boolean;
  className?: string;
}) {
  const err = useError(path);
  const id = fieldDomId(path);
  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>
        {label}
      </label>
      <div className={`flex items-center gap-1.5 ${hideLabel ? '' : 'mt-1'}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value.raw}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => onChange({ ...value, raw: e.target.value })}
          className={`${inputCls(err)} min-w-0 tabular-nums`}
        />
        <select
          id={fieldDomId(path + '.unit')}
          aria-label={`${label}の単位`}
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as U })}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
        >
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      {err ? (
        <span id={`${id}-err`} className="mt-1 block text-xs text-rose-700">
          {err}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </div>
  );
}

export function TwText({ path, label, value, onChange, placeholder }: { path: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = fieldDomId(path);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls()} mt-1`} />
    </div>
  );
}

const PILL: Record<Status, string> = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  calculated: 'border-slate-300 bg-white text-slate-700',
  ng: 'border-rose-400 bg-rose-50 text-rose-800',
  not_calculated: 'border-amber-300 bg-amber-50 text-amber-900',
  unconfirmed: 'border-amber-300 bg-amber-50 text-amber-900',
  individual: 'border-violet-300 bg-violet-50 text-violet-800',
  na: 'border-slate-200 bg-slate-50 text-slate-500',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

/** 状態の表示（色だけでなく記号と文字でも区別する） */
export function StatusPill({ status, children }: { status: Status; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILL[status]}`}>
      <span aria-hidden>{STATUS_MARK[status]}</span>
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}
