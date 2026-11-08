export interface DocBrief {
  id: string; title: string; char_count: number; created_at: string; preview: string;
  /** Solo los fragmentos de un texto largo: comparten group_id (el «contenedor»). */
  group_id?: string | null; group_name?: string | null; frag_index?: number | null;
}
/** Resultado de guardar. Si `fragments` existe, el texto era largo: `id` y `group_id` son los del contenedor. */
export interface SavedText extends DocBrief { fragments?: number }
export interface Doc extends DocBrief { content: string }
export interface Settings { k: number; b: number; r: number; threshold: number }
export type Verdict = "TP" | "FP" | "FN" | "TN";

export interface Candidate {
  id: string; title: string; bands: number[]; is_candidate: boolean;
  est: number; exact: number; p_theory: number; similar: boolean; verdict: Verdict;
}
export interface Best {
  id: string; title: string; exact: number; est: number; signature: number[];
  bands_equal: number[]; shared_count: number; norm_query: string; norm_doc: string;
  ranges_query: number[][]; ranges_doc: number[][];
}
export interface TuneOption {
  b: number; r: number; n: number; t: number; p_noise: number; p_threshold: number;
  high: number; p_high: number; recommended?: boolean;
}
export interface Tune { threshold: number; noise: number; options: TuneOption[] }
export interface Advice {
  s: number; title: string; p_now: number; detected: boolean; b: number; r: number; noise: number;
  needs_change: boolean;
  suggestion: { b: number; r: number; n: number; p_detect: number; p_noise: number } | null;
}
export interface Curve { points: number[][]; threshold: number }
export interface Analysis {
  params: { k: number; n: number; b: number; r: number; threshold_theory: number; target: number };
  query: { title: string; chars: number };
  normalize: { original: string; normalized: string; original_chars: number; normalized_chars: number };
  shingles: { total: number; sample: { text: string; value: number; shared: boolean }[] };
  signature: { values: number[]; explain: { index: number; a: number; b: number; min_text: string; min_fp: number; value: number }[] };
  bands: { index: number; rows: number[]; key: string; docs: string[] }[];
  candidates: Candidate[];
  best: Best | null;
  advice: Advice | null;
  evaluation: {
    total_docs: number; candidates: number; brute_comparisons: number;
    TP: number; FP: number; FN: number; TN: number;
    precision: number | null; recall: number | null; ms_build: number; ms_query: number; ms_brute: number;
  };
  curve: Curve;
  saved?: SavedText;
}
export interface Evaluation {
  params: Analysis["params"]; docs: number; total_pairs: number; candidate_pairs: number;
  tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null;
  ms_lsh: number; ms_brute: number;
  /** Pares de fragmentos del mismo contenedor, que no se comparan entre sí. */
  skipped_same_group: number;
  /** Documentos que hay en el banco; si es mayor que `docs`, la evaluación se recortó. */
  docs_in_bank: number; truncated: boolean;
  pairs: { a: string; b: string; s: number; candidate: boolean; verdict: Verdict }[];
  curve: Curve;
}
