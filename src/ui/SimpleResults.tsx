import type { SizingResult } from '../domain/result';
import { SIMPLE_GROUP_IDS, isSimpleOpenItem, type SimpleView } from '../domain/simpleView';
import { KindBadge, RefLinks, StatusBadge } from './common';

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
  return { ...result, openItems: result.openItems.filter((o) => SIMPLE_GROUP_IDS.includes(o.groupId) && isSimpleOpenItem(o.itemId)) };
}
