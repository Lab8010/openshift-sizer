import { Button } from './kit';

interface Props {
  hasPrevious: boolean;
  onStart: () => void;
  onResume: () => void;
  onSample: () => void;
  onDetail: () => void;
  onImport: () => void;
}

/** 何ができるか 3 行 + はじめるボタン + 所要時間（Network Advisor と同じ構成） */
export function TopPage({ hasPrevious, onStart, onResume, onSample, onDetail, onImport }: Props) {
  const link = 'text-red-800 underline underline-offset-2 hover:text-red-900';
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
      <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
        その VM、OpenShift では
        <br className="hidden sm:inline" />
        何台のサーバに載る？
      </h1>
      <ul className="mt-8 space-y-3 text-lg leading-relaxed text-slate-700">
        <li>・載せたい VM のサイズと台数、サーバの大きさを選択式で答えていくと</li>
        <li>・VM 用の物理サーバの必要台数と、コントロールプレーン・インフラの目安を計算し</li>
        <li>・根拠と出典つきの結果を、その場で PDF レポートにできます</li>
      </ul>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Button onClick={onStart} className="!px-8 !py-3.5 !text-base">
          サイジングをはじめる →
        </Button>
        <span className="text-sm text-slate-500">約 3 分・質問は 8 問（うち 2 問は任意）</span>
      </div>
      <div className="mt-12 space-y-2 text-sm text-slate-500">
        {hasPrevious && (
          <p>
            前回の続きから:{' '}
            <button type="button" onClick={onResume} className={link}>
              前回の入力の結果を見る
            </button>
          </p>
        )}
        <p>
          先に結果の例を見たい方へ:{' '}
          <button type="button" onClick={onSample} className={link}>
            サンプル案件の結果
          </button>
        </p>
        <p>
          細かく見積もりたい方へ:{' '}
          <button type="button" onClick={onDetail} className={link}>
            詳細入力（ネットワーク・ストレージ性能・実測値）
          </button>
        </p>
        <p>
          保存したデータがある方へ:{' '}
          <button type="button" onClick={onImport} className={link}>
            JSON を読み込む
          </button>
        </p>
      </div>
    </div>
  );
}
