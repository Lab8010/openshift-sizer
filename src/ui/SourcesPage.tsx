import type { SizingResult } from '../domain/result';
import { DISCLAIMER, PRODUCT } from '../domain/sources';
import { SourcesList } from './ResultParts';

export function SourcesPage({ result }: { result: SizingResult }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm font-medium text-red-700">前提・出典</p>
      <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">このツールの前提と、計算に使う公式資料</h1>

      <section className="mt-6 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-5 py-4">
        <h2 className="font-bold text-amber-950">{DISCLAIMER.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-amber-950">{DISCLAIMER.text}</p>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-bold text-slate-900">対象</h2>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-700">
            <li>・{PRODUCT.ocp}、{PRODUCT.virt}、OVN-Kubernetes</li>
            <li>・コントロールプレーン・コンピュート・インフラを分けた通常のマルチノード構成</li>
            <li>・適用範囲外: SNO、コンパクトクラスタ、Hosted Control Planes、ODF 自体の構成設計</li>
          </ul>
        </div>
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-bold text-slate-900">計算の考え方</h2>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-700">
            <li>・公式値は Red Hat の 4.22 版資料だけを使い、値ごとに出典を表示します</li>
            <li>・空欄は 0 や既定値に置き換えず、「未算出」「未確認」と表示します</li>
            <li>・このアプリの目安サイズや仮定値は「このアプリの仮定」と明示します</li>
            <li>・入力はブラウザ内だけで計算し、外部へは送信しません</li>
          </ul>
        </div>
      </section>

      <h2 className="mt-8 font-bold text-slate-900">出典一覧</h2>
      <div className="legacy mt-3">
        <SourcesList result={result} />
      </div>
    </div>
  );
}
