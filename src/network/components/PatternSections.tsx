import { useEffect, useMemo, useState } from 'react';
import type { Diagnosis } from '../data/types';
import { patterns, docLinks } from '../data/patterns';
import { vsphereMapping } from '../data/glossary';
import { PLATFORM_LABEL } from '../data/version';
import { defaultParams, generateYaml, paramLabels, resolveParams, type Params } from '../lib/generateYaml';
import { ParameterForm } from './ParameterForm';
import { YamlViewer } from './YamlViewer';
import { Accordion, RichText } from './ui';

/** 診断結果とパターン詳細で共通の部品 */

const yamlNotes: Record<string, string> = {
  A: 'Service の selector は VM オブジェクトではなく、virt-launcher Pod のラベル（app）を指します。',
  B: 'namespace スコープの UserDefinedNetwork 版と、複数 namespace で共有する ClusterUserDefinedNetwork 版を「詳細設定」で切り替えられます。',
  C: 'NetworkAttachmentDefinition（topology: localnet）を直接書いて代替する構成もあり得ます。ここでは CUDN の形を基本にしています。',
  D: 'NNCP がノード OS の構成そのものを宣言します。VLAN を足すたびに NNCP の追加が必要です。',
};

/** YAML のパラメータ。診断が変わったら、自動で決まる初期値（公開方法・スコープ）を追従させる */
export function usePatternParams(d: Diagnosis) {
  const [params, setParams] = useState<Params>(() => defaultParams(d));
  useEffect(() => {
    setParams((prev) => ({ ...prev, exposureType: d.defaults.exposureType, networkScope: d.defaults.networkScope }));
  }, [d.defaults.exposureType, d.defaults.networkScope]);
  return [params, setParams] as const;
}

/** 印刷 / PDF 化のときは折りたたみをすべて開く */
export function usePrintOpensDetails() {
  useEffect(() => {
    const openAll = () => document.querySelectorAll('details').forEach((el) => el.setAttribute('open', ''));
    window.addEventListener('beforeprint', openAll);
    return () => window.removeEventListener('beforeprint', openAll);
  }, []);
}

/** ポイント・メリット / デメリット・チェックリスト・vSphere 対応表 */
export function PatternAccordions({ d, openOverview = false }: { d: Diagnosis; openOverview?: boolean }) {
  const p = patterns[d.primary];
  const hasE = d.modifiers.includes('E');
  const mapping = vsphereMapping.filter((r) => p.mappingKeys.includes(r.key));
  const [checked, setChecked] = useState<Set<number>>(new Set());

  return (
    <>
      <Accordion title="この構成のポイント" defaultOpen={openOverview}>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {p.points.map((t, i) => (
            <li key={i}>
              <RichText text={t} />
            </li>
          ))}
        </ul>
        {hasE && (
          <>
            <h3 className="mt-4 text-sm font-semibold">追加 NIC（パターン E: マルチホーム）</h3>
            <ul className="mt-1 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {patterns.E.points.map((t, i) => (
                <li key={i}>
                  <RichText text={t} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Accordion>

      <Accordion title="メリットとデメリット" defaultOpen={openOverview}>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-semibold text-emerald-800">メリット</h3>
            <ul className="mt-1 space-y-1.5">
              {p.merits.map((t, i) => (
                <li key={i}>
                  ＋ <RichText text={t} />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-rose-800">デメリット・注意</h3>
            <ul className="mt-1 space-y-1.5">
              {p.demerits.map((t, i) => (
                <li key={i}>
                  − <RichText text={t} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Accordion>

      <Accordion title="移行チェックリスト" meta={`${d.checklist.length} 件`}>
        <ul className="space-y-2 text-sm">
          {d.checklist.map((t, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-3 leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-red-700"
                  checked={checked.has(i)}
                  onChange={() =>
                    setChecked((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <span className={t.startsWith('要確認') ? 'font-medium text-amber-900' : ''}>
                  <RichText text={t} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Accordion>

      <Accordion title="vSphere との対応" meta="置き場所が変わるだけ">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">vSphere</th>
                <th className="py-2 pr-4 font-medium">OpenShift Virtualization</th>
                <th className="py-2 font-medium">備考</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mapping.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 pr-4 align-top">{r.vsphere}</td>
                  <td className="py-2 pr-4 align-top">
                    <RichText text={r.openshift} />
                  </td>
                  <td className="py-2 align-top text-slate-500">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Accordion>
    </>
  );
}

/** サンプル YAML（パラメータ入力 + ビューア） */
export function YamlSection({ d, params, onParamsChange }: { d: Diagnosis; params: Params; onParamsChange: (p: Params) => void }) {
  const yaml = useMemo(() => generateYaml(d, params), [d, params]);
  const resolved = resolveParams(params);
  return (
    <section id="yaml" className="mt-12 scroll-mt-4">
      <h2 className="text-xl font-bold text-slate-900">サンプル YAML Manifest</h2>
      <p className="mt-1 text-sm text-slate-600">
        <RichText text={yamlNotes[d.primary]} />
      </p>
      <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <ParameterForm diagnosis={d} params={params} onChange={onParamsChange} errors={yaml.errors} />
      </div>
      <div className="mt-4">
        {yaml.errors.length > 0 ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900" role="alert">
            <p className="font-semibold">入力値に誤りがあるため、YAML を生成していません。</p>
            <ul className="mt-2 list-disc pl-5">
              {yaml.errors.map((e, i) => (
                <li key={i}>
                  {paramLabels[e.field].label}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <YamlViewer
            files={yaml.files}
            combined={yaml.combined}
            downloadName={`${resolved.vmName}-pattern-${d.primary.toLowerCase()}.yaml`}
          />
        )}
      </div>
    </section>
  );
}

/** 末尾: 公式ドキュメント（最大 3 件）・前提・免責 */
export function DocsFooter() {
  return (
    <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-600">
      <p className="font-medium text-slate-700">公式ドキュメント</p>
      <ul className="mt-1 space-y-1">
        {docLinks.map((l) => (
          <li key={l.url}>
            <a className="text-red-800 underline underline-offset-2 hover:text-red-900" href={l.url} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        前提: {PLATFORM_LABEL}。1 台の VM の主なネットワークを対象にしています。
        <br />
        本アプリの YAML は設計検討用のサンプルです。本番適用前に公式ドキュメントと実環境で検証してください。
      </p>
    </footer>
  );
}
