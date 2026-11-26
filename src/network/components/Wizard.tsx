import { useEffect } from 'react';
import type { Answers } from '../data/types';
import { computePath, questions } from '../data/questions';
import { QuestionCard } from './QuestionCard';
import { Button } from './ui';

interface Props {
  answers: Answers;
  onAnswersChange: (a: Answers) => void;
  index: number;
  onIndexChange: (i: number) => void;
  onDone: () => void;
  onExit: () => void;
}

export function Wizard({ answers, onAnswersChange, index, onIndexChange, onDone, onExit }: Props) {
  const path = computePath(answers);
  const safeIndex = Math.min(index, path.length - 1);
  const question = questions[path[safeIndex]];
  const answered = answers[question.id] !== undefined;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [question.id]);

  const goNext = (a: Answers) => {
    const newPath = computePath(a);
    if (safeIndex + 1 < newPath.length) onIndexChange(safeIndex + 1);
    else onDone();
  };

  const select = (value: string) => {
    if (question.type === 'multi') {
      const prev = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : [];
      let next: string[];
      if (value === 'none') next = prev.includes('none') ? [] : ['none'];
      else next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev.filter((v) => v !== 'none'), value];
      onAnswersChange({ ...answers, [question.id]: next });
      return;
    }
    // 選ぶだけでは進まない。「次へ」を押したときに進む
    onAnswersChange({ ...answers, [question.id]: value });
  };

  const next = () => {
    if (question.type === 'multi' && !answered) {
      const a = { ...answers, [question.id]: [] };
      onAnswersChange(a);
      goNext(a);
      return;
    }
    goNext(answers);
  };

  const back = () => {
    if (safeIndex === 0) onExit();
    else onIndexChange(safeIndex - 1);
  };

  const progress = Math.round(((safeIndex + 1) / path.length) * 100);
  const canNext = question.type === 'multi' || answered;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6">
        <div className="flex items-baseline justify-between text-sm text-slate-500">
          <span>
            質問 <span className="font-semibold text-slate-800">{safeIndex + 1}</span> / 約 {path.length}
          </span>
          <span>回答によって質問数が変わります</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-red-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <QuestionCard key={question.id} question={question} answers={answers} onSelect={select} />

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={back}>
          ← {safeIndex === 0 ? 'トップへ' : '戻る'}
        </Button>
        <Button onClick={next} disabled={!canNext}>
          {safeIndex + 1 >= path.length ? '診断結果を見る' : '次へ'} →
        </Button>
      </div>
    </div>
  );
}
