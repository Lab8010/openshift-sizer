import type { SizingResult } from '../domain/result';
import { AssumptionList, Legend, OpenItemsList, SectionView, SourcesList, SummaryTable } from './ResultParts';
import { StatusBadge } from './common';

export function ResultsView({ result }: { result: SizingResult }) {
  const vmTotals = result.groups.find((g) => g.id === 'vm')?.sections[0]?.items ?? [];
  const pick = (id: string) => vmTotals.find((i) => i.id === id);
  const keyIds = ['vmTotal.vcpu', 'vmTotal.cpuReq', 'vmTotal.mem', 'vmTotal.disk'];
  return (
    <div className="results">
      {result.inputErrorCount > 0 && (
        <p className="warn-box" role="status">
          入力エラーが {result.inputErrorCount} 件あります。エラーの項目は計算に使わず「未算出」として扱っています。
        </p>
      )}
      <div className="key-metrics" aria-label="基本の算出結果">
        {keyIds.map((id) => {
          const it = pick(id);
          if (!it) return null;
          return (
            <div className="metric" key={id}>
              <div className="m-label">{it.label}</div>
              <div className="m-value">{it.status === 'calculated' ? it.display : '—'}</div>
              <StatusBadge status={it.status} />
            </div>
          );
        })}
      </div>
      <h2>ノード別サマリー</h2>
      <SummaryTable result={result} />
      <Legend />
      <h2>前提と仮定</h2>
      <AssumptionList result={result} />
      <h2>未確認事項・要対応（{result.openItems.length} 件）</h2>
      <OpenItemsList result={result} />
      <h2>計算の内訳</h2>
      {result.groups.map((g) => (
        <details className="group" key={g.id} open={g.id !== 'bootstrap' && g.id !== 'platform'}>
          <summary>
            <h3>{g.title}</h3>
          </summary>
          {g.sections.map((s) => (
            <SectionView key={s.id} section={s} />
          ))}
        </details>
      ))}
      <h2>出典一覧（Red Hat 4.22 公式資料）</h2>
      <SourcesList result={result} />
    </div>
  );
}
