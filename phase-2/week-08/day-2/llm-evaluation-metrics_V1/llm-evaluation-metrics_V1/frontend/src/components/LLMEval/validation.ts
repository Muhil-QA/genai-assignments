import { FormState, FormValidationErrors, EvaluationProvider } from './types';

export const validateForm = (formData: FormState): FormValidationErrors => {
  const errors: FormValidationErrors = {};

  // Validate metric
  if (!formData.metric) {
    errors.metric = 'Metric is required';
  }

  // Validate query
  if (!formData.query || !formData.query.trim()) {
    errors.query = 'Query is required';
  }

  // Validate output (NOT required for pure context precision/recall metrics)
  if (shouldShowLLMOutput(formData.metric)) {
    if (!formData.output || !formData.output.trim()) {
      errors.output = 'Output is required';
    }
  }

  // Validate context (required for specific metrics)
  const validContexts = formData.context.filter((ctx) => ctx && ctx.trim().length > 0);
  const contextRequired = isContextRequired(formData.metric);
  
  if (contextRequired) {
    if (validContexts.length === 0) {
      errors.context = 'At least one context item is required for this metric';
    } else {
      const emptyContexts = formData.context.filter((ctx) => !ctx || !ctx.trim());
      if (emptyContexts.length > 0) {
        errors.context = `${emptyContexts.length} context item(s) are empty`;
      }
    }
  }

  // expected_output validation - required for context precision/recall metrics and RAGAS score
  if (shouldShowExpectedOutput(formData.metric)) {
    if (!formData.expected_output || !formData.expected_output.trim()) {
      errors.expected_output = `Expected output is required for ${formData.metric.replace(/_/g, ' ')} metric`;
    }
  }

  return errors;
};

export const isFormValid = (errors: FormValidationErrors): boolean => {
  return Object.keys(errors).length === 0;
};

/**
 * Get available metrics for the selected provider
 */
export const getMetricsForProvider = (provider: EvaluationProvider): string[] => {
  if (provider === 'ragas') {
    return ['faithfulness', 'context_precision', 'context_recall', 'ragas_score'];
  }
  return ['faithfulness', 'answer_relevancy', 'contextual_precision', 'contextual_recall', 'bias', 'hallucination'];
};

/**
 * Check if expected_output field should be shown/required
 */
export const shouldShowExpectedOutput = (metric: string): boolean => {
  const metricsRequiringExpected = [
    'contextual_precision',
    'contextual_recall',
    'context_precision',
    'context_recall',
    'ragas_score'
  ];
  return metricsRequiringExpected.includes(metric);
};

/**
 * Check if LLM output field should be shown/required
 */
export const shouldShowLLMOutput = (metric: string): boolean => {
  // Pure retrieval context quality metrics don't evaluate LLM output
  const metricsNotUsingOutput = [
    'contextual_precision',
    'contextual_recall',
    'context_precision',
    'context_recall'
  ];
  return !metricsNotUsingOutput.includes(metric);
};

/**
 * Check if context field is required for the metric
 */
export const isContextRequired = (metric: string): boolean => {
  // Context is optional for: answer_relevancy (and pii_leakage/bias if present)
  // Context is required for: faithfulness, precision, recall, hallucination, composite RAGAS score
  const metricsNotRequiringContext = ['answer_relevancy', 'pii_leakage', 'bias'];
  return !metricsNotRequiringContext.includes(metric);
};
