import type { SizingResult } from '../domain/result';
import { SIMPLE_GROUP_IDS, type SimpleView } from '../domain/simpleView';
import { KindBadge, RefLinks, StatusBadge } from './common';
import { AssumptionList, Legend, OpenItemsList, SectionView, SourcesList } from './ResultParts';

export function SimpleVerdict({ view }: { view: SimpleView }) {
  return (
    <div className={`verdict verdict-${view.verdict.status}`} role="status">
      <div className="verdict-head">
        <StatusBadge status={view.verdict.status} />
        <strong>{view.verdict.headline}</strong>
      </div>
      <ul>
        {view.verdict.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

export function SimpleTables({ view }: { view: SimpleView }) {
  return (
    <>
      {view.sections.map((s) => (
        <div className="section" key={s.title}>
          <h3>{s.title}</h3>
          <table className="items simple-items">
            <colgroup>
              <col className="c-label" />
              <col className="c-val" />
              <col className="c-kind" />
              <col className="c-status" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">項目</th>
                <th scope="col">値</th>
                <th scope="col">値の種類</th>
                <th scope="col">状態</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r.label}</th>
                  <td className="val">
                    {r.value}
                    {(r.note || r.refs?.length) && (
                      <div className="row-note">
                        {r.note}
                        {r.note && r.refs?.length ? ' ' : ''}
                        <RefLinks refs={r.refs} />
                      </div>
                    )}
                  </td>
                  <td>
                    <KindBadge kind={r.kind} />
                  </td>
                  <td>{r.status ? <StatusBadge status={r.status} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

export function simpleOpenItems(result: SizingResult): SizingResult {
  return { ...result, openItems: result.openItems.filter((o) => SIMPLE_GROUP_IDS.includes(o.groupId)) };
}

export function SimpleResults({ result, view }: { result: SizingResult; view: SimpleView }) {
  const filtered = simpleOpenItems(result);
  return (
    <div className="results simple-results">
      <h2>サイジング結果</h2>
      {result.inputErrorCount > 0 && (
        <p className="warn-box" role="status">
          入力エラーが {result.inputErrorCount} 件あります。エラーの項目は計算に使わず「未算出」として扱っています。
        </p>
      )}
      <SimpleVerdict view={view} />
      <SimpleTables view={view} />
      <Legend />
      <h2>前提と仮定</h2>
      <AssumptionList result={result} />
      <h2>確認事項（{filtered.openItems.length} 件）</h2>
      <p className="hint">ネットワーク・ストレージ性能・監視などの確認項目は、詳細版で入力・確認できます。</p>
      <OpenItemsList result={filtered} />
      <details className="group">
        <summary>
          <h3>計算の内訳（詳細版と同じ計算結果）</h3>
        </summary>
        {result.groups
          .filter((g) => SIMPLE_GROUP_IDS.includes(g.id))
          .map((g) => (
            <div key={g.id}>
              <h3>{g.title}</h3>
              {g.sections.map((s) => (
                <SectionView key={s.id} section={s} />
              ))}
            </div>
          ))}
      </details>
      <h2>出典一覧（Red Hat 4.22 公式資料）</h2>
      <SourcesList result={result} />
    </div>
  );
}
