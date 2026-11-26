import type { Diagnosis, PrimaryPatternId } from '../data/types';
import { patterns } from '../data/patterns';

/**
 * パターン一覧から詳細を見るときの「診断なし」の Diagnosis。
 * 質問に答えていないので、理由・注意・要確認は空。YAML とチェックリストはパターンの標準形で出す。
 */
export function previewDiagnosis(primary: PrimaryPatternId): Diagnosis {
  return {
    primary,
    modifiers: [],
    alternatives: [],
    reasons: [],
    warnings: [],
    checklist: patterns[primary].checklist.slice(0, 7),
    defaults: {
      exposureType: primary === 'A' ? 'Route' : 'ClusterIP',
      networkScope: 'cluster',
      clientsOutside: primary === 'C' || primary === 'D',
    },
    unknowns: [],
  };
}
