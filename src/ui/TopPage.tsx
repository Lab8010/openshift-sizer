import { Button } from './kit';

interface Props {
  hasPrevious: boolean;
  onStart: () => void;
  onResume: () => void;
  onSample: () => void;
  onDetail: () => void;
  onImport: () => void;
  onNetwork: () => void;
}

/** 何ができるか 3 行 + はじめるボタン + 所要時間（Network Advisor と同じ構成） */
export function TopPage({ hasPrevious, onStart, onResume, onSample, onDetail, onImport, onNetwork }: Props) {
  const link = 'text-red-800 underline underline-offset-2 hover:text-red-900';
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
      <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
        その VM、OpenShift では
        <br className="hidden sm:inline" />
        何台のサーバに、どのネットワークで載せる？
      </h1>
      <ul className="mt-8 space-y-3 text-lg leading-relaxed text-slate-700">
        <li>・載せたい VM とサーバの大きさを選択式で答えると、必要なサーバ台数と各ノードの目安を計算し</li>
        <li>・VM のつなぎ方を答えると、OpenShift Virtualization のネットワーク構成を診断して</li>
        <li>・根拠と出典つきの結果を、その場で 1 つの PDF レポートにまとめられます</li>
      </ul>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Button onClick={onStart} className="!px-8 !py-3.5 !text-base">
          サイジングをはじめる →
        </Button>
        <Button variant="secondary" onClick={onNetwork} className="!px-6 !py-3.5 !text-base">
          ネットワーク構成を診断する →
        </Button>
      </div>
      <p className="mt-3 text-sm text-slate-500">どちらも約 3 分。サイジングは 8 問、ネットワーク診断は 5〜10 問です。どちらから始めても、結果は互いに連携します。</p>
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
