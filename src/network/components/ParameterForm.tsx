import type { Diagnosis } from '../data/types';
import {
  paramLabels,
  resolveParams,
  visibleParams,
  type ParamKey,
  type Params,
  type ValidationError,
} from '../lib/generateYaml';

interface Props {
  diagnosis: Diagnosis;
  params: Params;
  onChange: (p: Params) => void;
  errors: ValidationError[];
}

const selectOptions: Partial<Record<ParamKey, { value: string; label: string }[]>> = {
  exposureType: [
    { value: 'Route', label: 'Route（HTTP/HTTPS をホスト名で公開）' },
    { value: 'LoadBalancer', label: 'LoadBalancer（L4、HTTP 以外も可）' },
    { value: 'NodePort', label: 'NodePort（L4、ノードのポートで公開）' },
    { value: 'ClusterIP', label: 'ClusterIP（クラスタ内からのみ）' },
  ],
  networkScope: [
    { value: 'namespace', label: 'UserDefinedNetwork（namespace スコープ）' },
    { value: 'cluster', label: 'ClusterUserDefinedNetwork（複数 namespace で共有）' },
  ],
};

/** §7.1: 主要項目は最大 5 件。必須入力はなく、初期値のままで生成済み */
export function ParameterForm({ diagnosis, params, onChange, errors }: Props) {
  const { main, advanced } = visibleParams(diagnosis);
  const resolved = resolveParams(params);

  const field = (key: ParamKey) => {
    const meta = paramLabels[key];
    const error = errors.find((e) => e.field === key);
    const id = `param-${key}`;
    const opts = selectOptions[key];
    const autoPlaceholder =
      key === 'physicalNetworkName' || key === 'linuxBridgeName' ? `自動: ${resolved[key]}` : undefined;
    const common = `mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 ${
      error ? 'border-rose-500' : 'border-slate-300'
    }`;
    return (
      <label key={key} htmlFor={id} className="block">
        <span className="text-sm font-medium text-slate-700">{meta.label}</span>
        {opts ? (
          <select
            id={id}
            className={common}
            value={params[key]}
            onChange={(e) => onChange({ ...params, [key]: e.target.value })}
          >
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className={`${common} font-mono`}
            value={params[key]}
            placeholder={autoPlaceholder}
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => onChange({ ...params, [key]: e.target.value })}
          />
        )}
        {error ? (
          <span id={`${id}-err`} className="mt-1 block text-xs text-rose-700">
            {error.message}
          </span>
        ) : (
          meta.hint && <span className="mt-1 block text-xs text-slate-500">{meta.hint}</span>
        )}
      </label>
    );
  };

  return (
    <div className="no-print">
      <p className="text-sm text-slate-600">
        サンプル値で生成済みです。自分の環境の値に差し替えると、下の YAML がその場で更新されます。
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{main.map(field)}</div>
      <details className="mt-4">
        <summary className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <span className="chevron inline-block transition-transform" aria-hidden>
            ▸
          </span>
          詳細設定（{advanced.length} 項目・既定値で生成済み）
        </summary>
        <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">{advanced.map(field)}</div>
      </details>
    </div>
  );
}
