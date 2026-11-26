export type QuestionId =
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'q5'
  | 'q6'
  | 'q7'
  | 'q8'
  | 'q9'
  | 'q10'
  | 'q11';

/** 単一選択は string、複数選択（Q11）は string[] */
export type Answers = Partial<Record<QuestionId, string | string[]>>;

export interface QuestionOption {
  value: string;
  label: string;
  /** §5.4: 「こういう場合はこっち」の具体例（必須・60 字程度まで） */
  example: string;
  /** §5.4: 選ぶと診断がどう寄るか 1 行（必須・先頭の矢印は UI 側で付ける） */
  consequence: string;
}

export interface Question {
  id: QuestionId;
  /** 質問文 */
  title: string;
  /** 1 行要約（ファーストビューに出す） */
  lead: string;
  /** 「なぜ聞くか」を含む補足（「詳しく」折りたたみの中） */
  help: string;
  /** §5.4: 迷ったときの確認手順（1 つだけ） */
  unsureHint: string;
  type: 'single' | 'multi';
  options: QuestionOption[];
  /** 回答から次の質問を決める。'done' で質問終了 */
  next: (answers: Answers) => QuestionId | 'done';
}

export type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type PrimaryPatternId = 'A' | 'B' | 'C' | 'D';

export interface Reason {
  questionId: QuestionId;
  /** ユーザーが選んだ選択肢の文言 */
  answerLabel: string;
  /** その回答がなぜこの構成に繋がるか */
  text: string;
}

export type ExposureType = 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'Route';

export interface Diagnosis {
  primary: PrimaryPatternId;
  /** 修飾パターン（'E'） */
  modifiers: PatternId[];
  /** 代替案として併記するパターン */
  alternatives: PrimaryPatternId[];
  /** 例外枠（'F'） */
  exceptionNote?: 'F';
  reasons: Reason[];
  warnings: string[];
  /** 移行チェックリスト（最大 7 件） */
  checklist: string[];
  /** パラメータの初期値を決めるためのヒント */
  defaults: {
    exposureType: ExposureType;
    /** B のネットワーク定義を CUDN（cluster）で出すか UDN（namespace）で出すか */
    networkScope: 'cluster' | 'namespace';
    clientsOutside: boolean;
  };
  /** 「分からない」と答えた質問 */
  unknowns: QuestionId[];
}
