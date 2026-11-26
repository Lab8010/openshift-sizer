import type { Answers, Question } from '../data/types';
import { inlineNotice, qLabel } from '../data/questions';
import { RichText } from './ui';

interface Props {
  question: Question;
  answers: Answers;
  onSelect: (value: string) => void;
}

/** §5.4 の意思決定支援表示つきの質問カード */
export function QuestionCard({ question, answers, onSelect }: Props) {
  const current = answers[question.id];
  const isSelected = (v: string) => (Array.isArray(current) ? current.includes(v) : current === v);
  const isMulti = question.type === 'multi';

  return (
    <section aria-labelledby={`${question.id}-title`}>
      <p className="text-sm font-medium text-red-700">{qLabel(question.id)}</p>
      <h2 id={`${question.id}-title`} className="mt-1 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
        {question.title}
      </h2>
      <p className="mt-2 text-slate-600">{question.lead}</p>
      <details className="mt-1 text-sm text-slate-600">
        <summary className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
          <span className="chevron inline-block transition-transform" aria-hidden>
            ▸
          </span>
          詳しく（なぜ聞くのか）
        </summary>
        <p className="mt-2 rounded-lg bg-white p-4 leading-relaxed ring-1 ring-slate-200">
          <RichText text={question.help} />
        </p>
      </details>

      <div
        role={isMulti ? 'group' : 'radiogroup'}
        aria-labelledby={`${question.id}-title`}
        className={`mt-6 grid gap-3 ${question.options.length >= 3 ? 'md:grid-cols-2' : ''}`}
      >
        {question.options.map((o) => {
          const selected = isSelected(o.value);
          const notice = inlineNotice(question.id, o.value, answers);
          return (
            <div
              key={o.value}
              role={isMulti ? 'checkbox' : 'radio'}
              aria-checked={selected}
              tabIndex={0}
              onClick={() => onSelect(o.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(o.value);
                }
              }}
              className={`flex cursor-pointer flex-col rounded-xl border-2 bg-white p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 ${
                selected ? 'border-red-700 shadow-sm' : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <span className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center border-2 text-xs text-white ${
                    isMulti ? 'rounded' : 'rounded-full'
                  } ${selected ? 'border-red-700 bg-red-700' : 'border-slate-300'}`}
                >
                  {selected ? '✓' : ''}
                </span>
                <span className="font-semibold leading-snug text-slate-900">{o.label}</span>
              </span>
              <span className="mt-2 pl-8 text-sm leading-relaxed text-slate-600">例: {o.example}</span>
              <span className="mt-auto flex items-start gap-1.5 pl-8 pt-3 text-sm font-medium text-slate-700">
                <span aria-hidden className="text-red-700">
                  →
                </span>
                <span>
                  <RichText text={o.consequence} />
                </span>
              </span>
              {notice && (
                <span className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  ⚠ {notice}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">点線の用語はクリックすると解説が開きます。選んだら「次へ」で進みます。</p>

      <aside className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
        <span className="font-semibold">迷ったら</span>
        <span className="mx-2 text-sky-300">|</span>
        {question.unsureHint.replace(/^迷ったら:\s*/, '')}
      </aside>
    </section>
  );
}
