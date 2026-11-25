import { createContext, useContext, type ReactNode } from 'react';
import { fieldDomId } from '../domain/parse';
import type { Qty } from '../domain/types';

/** パス → エラーメッセージ */
export const ErrorsContext = createContext<Map<string, string>>(new Map());

function useFieldError(path: string): string | undefined {
  const m = useContext(ErrorsContext);
  return m.get(path) ?? m.get(path + '.unit');
}

export const NA_LIST_ID = 'na-options';

export function NaDatalist() {
  return (
    <datalist id={NA_LIST_ID}>
      <option value="対象外" />
    </datalist>
  );
}

interface BaseProps {
  path: string;
  label: string;
  hint?: ReactNode;
  /** 表では見出しで分かるためラベルを視覚的に隠す */
  hideLabel?: boolean;
  className?: string;
}

export function NumField({
  path,
  label,
  value,
  onChange,
  hint,
  hideLabel,
  className,
  suffix,
  allowNa = true,
}: BaseProps & { value: string; onChange: (v: string) => void; suffix?: string; allowNa?: boolean }) {
  const err = useFieldError(path);
  const id = fieldDomId(path);
  return (
    <div className={`field ${className ?? ''} ${err ? 'has-error' : ''}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <div className="input-row">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          list={allowNa ? NA_LIST_ID : undefined}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      {hint && !hideLabel && (
        <div className="hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {err && (
        <div className="error" id={`${id}-err`} role="alert">
          {err}
        </div>
      )}
    </div>
  );
}

export function QtyField<U extends string>({
  path,
  label,
  value,
  units,
  onChange,
  hint,
  hideLabel,
  className,
}: BaseProps & { value: Qty<U>; units: readonly U[]; onChange: (v: Qty<U>) => void }) {
  const err = useFieldError(path);
  const id = fieldDomId(path);
  const uid = fieldDomId(path + '.unit');
  return (
    <div className={`field ${className ?? ''} ${err ? 'has-error' : ''}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <div className="input-row">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value.raw}
          list={NA_LIST_ID}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange({ ...value, raw: e.target.value })}
        />
        <select id={uid} aria-label={`${label}の単位`} value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as U })}>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {hint && !hideLabel && (
        <div className="hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {err && (
        <div className="error" id={`${id}-err`} role="alert">
          {err}
        </div>
      )}
    </div>
  );
}

export function TextField({ path, label, value, onChange, hint, className, multiline }: BaseProps & { value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const id = fieldDomId(path);
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function SelectField<T extends string>({
  path,
  label,
  value,
  options,
  onChange,
  hint,
  hideLabel,
  className,
}: BaseProps & { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = fieldDomId(path);
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && !hideLabel && <div className="hint">{hint}</div>}
    </div>
  );
}

export function CheckField({ path, label, checked, onChange, hint, className }: BaseProps & { checked: boolean; onChange: (v: boolean) => void }) {
  const id = fieldDomId(path);
  return (
    <div className={`field check ${className ?? ''}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export const TRI_OPTIONS = [
  { value: 'unknown' as const, label: '未確認' },
  { value: 'yes' as const, label: 'はい' },
  { value: 'no' as const, label: 'いいえ' },
];
