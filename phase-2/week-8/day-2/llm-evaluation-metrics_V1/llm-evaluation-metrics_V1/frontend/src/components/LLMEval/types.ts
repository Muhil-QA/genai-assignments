/**
 * DeepEval Metric types
 * - faithfulness: Output faithful to context
 * - answer_relevancy: Output relevant to query
 * - contextual_precision: Relevant nodes ranked higher than irrelevant nodes
 * - contextual_recall: Context contains info to answer expected_output
 * - pii_leakage: Detects personally identifiable information in output
 * - bias: Detects bias in LLM outputs
 * - hallucination: Detects hallucinations in LLM outputs by comparing with context
 */
export type MetricOption =
  | 'faithfulness'
  | 'answer_relevancy'
  | 'contextual_precision'
  | 'contextual_recall'
  | 'context_precision'
  | 'context_recall'
  | 'ragas_score'
  | 'pii_leakage'
  | 'bias'
  | 'hallucination';

/**
 * LLM Evaluation provider type
 */
export type EvaluationProvider = 'deepeval' | 'ragas';

/**
 * Form state for LLM evaluation (provider-agnostic)
 */
export interface FormState {
  provider: EvaluationProvider;
  metric: MetricOption;
  query: string;
  output: string;
  context: string[];
  expected_output?: string;
}

/**
 * Validation error messages
 */
export interface FormValidationErrors {
  provider?: string;
  metric?: string;
  query?: string;
  output?: string;
  context?: string;
  expected_output?: string;
}

/**
 * LLM Evaluation response (generic for all providers)
 */
export interface LLMEvalResponse {
  metric?: MetricOption;
  metric_name?: string;
  query?: string;
  output?: string;
  context?: string[];
  score: number;
  verdict?: string;
  explanation: string;
  reference_used?: string;
  provider?: EvaluationProvider;
  results?: Array<{
    metric_name: string;
    score: number;
    explanation: string;
    error?: string | null;
  }>;
}

/**
 * API error response
 */
export interface ApiError {
  message: string;
  status?: number;
  details?: string;
}

// Backward compatibility aliases (deprecated)
/** @deprecated Use LLMEvalResponse instead */
export type RagasResponse = LLMEvalResponse;

/** @deprecated Use FormState instead */
export type RagasFormState = FormState;
