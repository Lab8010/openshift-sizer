import { KIND_LABEL, STATUS_LABEL, STATUS_MARK, type Kind, type ResultItem, type Status } from '../domain/result';
import { resolveRef } from '../domain/sources';

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden="true">{STATUS_MARK[status]} </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function KindBadge({ kind }: { kind: Kind }) {
  return <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>;
}

/** 出典リンク（資料 ID + 章節） */
export function RefLink({ refKey }: { refKey: string }) {
  const r = resolveRef(refKey);
  if (!r) return <span className="ref-missing">［出典未登録: {refKey}］</span>;
  return (
    <a className="ref" href={r.url} target="_blank" rel="noreferrer" title={`${r.title}（${r.url}）`}>
      [{r.sourceId} {r.section}]
    </a>
  );
}

export function RefLinks({ refs }: { refs?: string[] }) {
  if (!refs?.length) return null;
  // 同じ資料・章節は 1 回だけ表示
  const seen = new Set<string>();
  const uniq = refs.filter((k) => {
    const r = resolveRef(k);
    const key = r ? `${r.sourceId}|${r.section}` : k;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <span className="refs">
      {uniq.map((k) => (
        <RefLink key={k} refKey={k} />
      ))}
    </span>
  );
}

/** 計算内訳（式・入力・不足項目・注記・出典） */
export function ItemBreakdown({ item }: { item: ResultItem }) {
  return (
    <div className="breakdown">
      {item.formula && (
        <p>
          <span className="bk-label">式：</span>
          {item.formula}
        </p>
      )}
      {item.basis?.length ? (
        <p>
          <span className="bk-label">入力：</span>
          {item.basis.map((b, i) => (
            <span key={i} className="basis">
              {b.label} = {b.value}
              {i < (item.basis?.length ?? 0) - 1 ? '、' : ''}
            </span>
          ))}
        </p>
      ) : null}
      {item.missing?.length ? (
        <p className="missing">
          <span className="bk-label">不足・確認：</span>
          {[...new Set(item.missing)].join('、')}
        </p>
      ) : null}
      {item.note && (
        <p>
          <span className="bk-label">注記：</span>
          {item.note}
        </p>
      )}
      {item.refs?.length ? (
        <p>
          <span className="bk-label">出典：</span>
          <RefLinks refs={item.refs} />
        </p>
      ) : null}
    </div>
  );
}

export function hasBreakdown(item: ResultItem): boolean {
  return !!(item.formula || item.basis?.length || item.missing?.length || item.note || item.refs?.length);
}
