import { glossary, vsphereMapping } from '../data/glossary';
import { Diagram } from './Diagram';
import { Button, RichText } from './ui';

/** §9: 解説コラム（§4.1）・用語集（§4.3）・vSphere 対応表（§4.4） */
export function Glossary({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      <nav className="no-print flex flex-wrap gap-2 text-sm" aria-label="このページの目次">
        <a href="#column" className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 hover:bg-slate-50">
          解説: ゲスト IP が宛先にならない理由
        </a>
        <a href="#glossary" className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 hover:bg-slate-50">
          用語集
        </a>
        <a href="#mapping" className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 hover:bg-slate-50">
          vSphere との対応表
        </a>
      </nav>

      <section id="column" className="mt-8 scroll-mt-4">
        <h1 className="text-2xl font-bold text-slate-900">Pod Network では、ゲスト IP は宛先にならない</h1>
        <p className="mt-3 leading-relaxed">
          vSphere では「VM の NIC の IP アドレスが宛先」なのが当たり前でした。OpenShift Virtualization の標準である Pod Network では、ここが変わります。
          今までの設計が間違いなのではなく、<strong>宛先の置き場所が変わる</strong>と考えてください。
        </p>
        <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <Diagram pattern="A" />
        </div>
        <ol className="mt-6 space-y-3 leading-relaxed">
          {[
            'Pod Network 上の VM は、virt-launcher Pod の中で動きます。',
            '既定の masquerade バインディングでは、ゲスト OS は Pod の中の閉じた小さなネットワークにいます。典型例では、ゲストは 10.0.2.2/24、ゲートウェイは 10.0.2.1 を見ています。',
            'この 10.0.2.2 は全 VM 共通なので、一意な宛先になりません。クラスタ内に、そのアドレスへのルートもありません。',
            '外向きの通信は virt-launcher Pod の中で NAT され、クラスタ内から見えるのは Pod IP です。',
            'Pod IP はノードごとのサブネットから払い出されるため、ライブマイグレーションで変わります。既定の Pod Network 経由の通信は、ライブマイグレーションのときに中断されます。',
            'そのため、Pod Network の VM へのアクセスポイントはゲスト IP ではなく、Service（ClusterIP）→ Pod IP → NAT → ゲスト という経路になります。外部公開は Route（HTTP のみ）、LoadBalancer、NodePort で行います。',
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold">
                {i + 1}
              </span>
              <span>
                <RichText text={t} />
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-xl border-l-4 border-red-700 bg-white px-5 py-4 ring-1 ring-slate-200">
          <p className="font-semibold">だから、最初に聞くのは「ゲスト IP を宛先にする形式を維持するか」</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            維持するなら、NAT を挟まない bridge バインディングで、実在する L2 セグメント（UDN Layer2 のオーバーレイ、または物理 VLAN に繋がる Localnet / Linux Bridge）に VM を参加させます。
          </p>
          <Button className="no-print mt-4" onClick={onStart}>
            診断をはじめる →
          </Button>
        </div>
      </section>

      <section id="glossary" className="mt-14 scroll-mt-4">
        <h2 className="text-xl font-bold text-slate-900">用語集</h2>
        <dl className="mt-4 divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
          {glossary.map((g) => (
            <div key={g.term} className="grid gap-1 px-5 py-4 sm:grid-cols-[18rem_1fr] sm:gap-6">
              <dt className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{g.term}</dt>
              <dd className="text-sm leading-relaxed text-slate-700">{g.definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-slate-500">
          注意: OVN の port_group は ACL の適用対象をまとめたポート集合で、vSphere のポートグループとは別物です。
        </p>
      </section>

      <section id="mapping" className="mt-14 scroll-mt-4">
        <h2 className="text-xl font-bold text-slate-900">vSphere との対応表</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          標準スイッチ (vSS) と分散スイッチ (vDS) のポートグループは、VM から見れば同じセグメントです。違うのは管理方式だけなので、「vSS だから Linux Bridge」のような対応付けはしません。移行先は、ゲスト IP を宛先にする必要があるかなどの機能要件で決めます。
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">vSphere</th>
                <th className="px-4 py-3 font-medium">OpenShift Virtualization</th>
                <th className="px-4 py-3 font-medium">備考</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vsphereMapping.map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-3 align-top">{r.vsphere}</td>
                  <td className="px-4 py-3 align-top">{r.openshift}</td>
                  <td className="px-4 py-3 align-top text-slate-500">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
