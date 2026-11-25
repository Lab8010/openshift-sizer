import { useState } from 'react';
import { KIND_LABEL, STATUS_LABEL, STATUS_MARK, type Kind, type ResultItem, type Section, type SizingResult, type Status, type SummaryCell } from '../domain/result';
import { SOURCES } from '../domain/sources';
import { usedSourceIds } from '../domain/calc';
import { ItemBreakdown, KindBadge, StatusBadge, hasBreakdown } from './common';

function Cell({ c }: { c: SummaryCell }) {
  return (
    <td>
      {c.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      {c.status && c.status !== 'info' && (
        <div>
          <StatusBadge status={c.status} />
        </div>
      )}
    </td>
  );
}

export function SummaryTable({ result, split }: { result: SizingResult; split?: boolean }) {
  const head1 = (
    <>
      <th scope="col" rowSpan={2}>
        台数
      </th>
      <th scope="colgroup" colSpan={2}>
        CPU
      </th>
      <th scope="colgroup" colSpan={2}>
        メモリ
      </th>
    </>
  );
  const head2 = (
    <>
      <th scope="colgroup" colSpan={2}>
        ローカルストレージ
      </th>
      <th scope="col" rowSpan={2}>
        共有ストレージ
      </th>
      <th scope="col" rowSpan={2}>
        ネットワーク
      </th>
    </>
  );
  const sub1 = (
    <>
      <th scope="col">1 台あたり</th>
      <th scope="col">ロール合計</th>
      <th scope="col">1 台あたり</th>
      <th scope="col">ロール合計</th>
    </>
  );
  const sub2 = (
    <>
      <th scope="col">1 台あたり</th>
      <th scope="col">ロール合計</th>
    </>
  );
  const body1 = (r: SizingResult['summary'][number]) => (
    <>
      <Cell c={r.count} />
      <Cell c={r.cpuPer} />
      <Cell c={r.cpuTotal} />
      <Cell c={r.memPer} />
      <Cell c={r.memTotal} />
    </>
  );
  const body2 = (r: SizingResult['summary'][number]) => (
    <>
      <Cell c={r.localPer} />
      <Cell c={r.localTotal} />
      <Cell c={r.shared} />
      <Cell c={r.network} />
    </>
  );
  const table = (caption: string, h: React.ReactNode, sub: React.ReactNode, body: (r: SizingResult['summary'][number]) => React.ReactNode) => (
    <div className="table-wrap">
      <table className="summary">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>
              ロール
            </th>
            {h}
          </tr>
          <tr>{sub}</tr>
        </thead>
        <tbody>
          {result.summary.map((r) => (
            <tr key={r.role}>
              <th scope="row">{r.role}</th>
              {body(r)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (split) {
    return (
      <>
        {table('ノード別サマリー（1）台数・CPU・メモリ', head1, sub1, body1)}
        {table('ノード別サマリー（2）ローカルストレージ・共有ストレージ・ネットワーク', head2, sub2, body2)}
      </>
    );
  }
  return table(
    'ノード別サマリー（台数・1 台あたり・ロール合計）',
    <>
      {head1}
      {head2}
    </>,
    <>
      {sub1}
      {sub2}
    </>,
    (r) => (
      <>
        {body1(r)}
        {body2(r)}
      </>
    ),
  );
}

function ItemRow({ item, print }: { item: ResultItem; print?: boolean }) {
  const [open, setOpen] = useState(false);
  const can = hasBreakdown(item);
  return (
    <>
      <tr className={`item status-row-${item.status}`}>
        <th scope="row">{item.label}</th>
        <td className="val">{item.display}</td>
        <td>
          <KindBadge kind={item.kind} />
        </td>
        <td>
          <StatusBadge status={item.status} />
        </td>
        {!print && (
          <td className="noprint">
            {can && (
              <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? '閉じる' : '内訳'}
              </button>
            )}
          </td>
        )}
      </tr>
      {can && (print || open) && (
        <tr className="bk-row">
          <td colSpan={print ? 4 : 5}>
            <ItemBreakdown item={item} />
          </td>
        </tr>
      )}
    </>
  );
}

export function SectionView({ section, print }: { section: Section; print?: boolean }) {
  return (
    <div className="section">
      <h4>{section.title}</h4>
      {section.items.length > 0 && (
        <table className="items">
          <colgroup>
            <col className="c-label" />
            <col className="c-val" />
            <col className="c-kind" />
            <col className="c-status" />
            {!print && <col className="c-btn" />}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">値</th>
              <th scope="col">値の種類</th>
              <th scope="col">状態</th>
              {!print && (
                <th scope="col" className="noprint">
                  <span className="sr-only">内訳</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {section.items.map((it) => (
              <ItemRow key={it.id} item={it} print={print} />
            ))}
          </tbody>
        </table>
      )}
      {section.tables?.map((t, i) => (
        <div className="table-wrap" key={i}>
          <table className="data">
            {t.caption && <caption>{t.caption}</caption>}
            <thead>
              <tr>
                {t.columns.map((c) => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((v, k) => (k === 0 ? <th scope="row" key={k}>{v}</th> : <td key={k}>{v}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function AssumptionList({ result }: { result: SizingResult }) {
  return (
    <ul className="assumptions">
      {result.assumptions.map((a, i) => (
        <li key={i}>
          <KindBadge kind={a.kind} /> {a.text}
        </li>
      ))}
    </ul>
  );
}

export function OpenItemsList({ result }: { result: SizingResult }) {
  if (!result.openItems.length) return <p>未算出・未確認・要個別評価・不適合の項目はありません。</p>;
  return (
    <table className="data open-items">
      <thead>
        <tr>
          <th scope="col">状態</th>
          <th scope="col">項目</th>
          <th scope="col">場所</th>
          <th scope="col">不足入力・確認事項</th>
        </tr>
      </thead>
      <tbody>
        {result.openItems.map((o, i) => (
          <tr key={i}>
            <td>
              <StatusBadge status={o.status} />
            </td>
            <th scope="row">{o.label}</th>
            <td>{o.sectionTitle}</td>
            <td>{o.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Legend() {
  const statuses: Status[] = ['ok', 'ng', 'calculated', 'not_calculated', 'unconfirmed', 'individual', 'na', 'info'];
  const kinds: Kind[] = ['official_min', 'official_rec', 'official_default', 'input', 'measured', 'derived', 'assumption', 'sample'];
  return (
    <div className="legend">
      <p>
        <strong>状態：</strong>
        {statuses.map((s) => (
          <span key={s} className="legend-item">
            {STATUS_MARK[s]} {STATUS_LABEL[s]}
          </span>
        ))}
      </p>
      <p>
        <strong>値の種類：</strong>
        {kinds.map((k) => (
          <span key={k} className="legend-item">
            {KIND_LABEL[k]}
          </span>
        ))}
      </p>
    </div>
  );
}

export function SourcesList({ result }: { result: SizingResult }) {
  const used = new Set(usedSourceIds(result));
  return (
    <table className="data sources">
      <colgroup>
        <col className="s-id" />
        <col className="s-title" />
        <col className="s-sec" />
        <col className="s-url" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">出典 ID</th>
          <th scope="col">資料（製品・版）</th>
          <th scope="col">参照章節・内容</th>
          <th scope="col">公式 URL</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(SOURCES).map((s) => (
          <tr key={s.id}>
            <th scope="row">
              {s.id}
              {used.has(s.id) ? '' : '（本結果では未使用）'}
            </th>
            <td>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
              <br />
              {s.product}
            </td>
            <td>
              {s.sections}
              <br />
              {s.scope}
            </td>
            <td className="url">
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.url}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
