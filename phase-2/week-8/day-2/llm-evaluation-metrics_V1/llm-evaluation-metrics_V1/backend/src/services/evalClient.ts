import axios from "axios";
import { ENV } from "../config/env.js";

export interface MetricResult {
  metric_name: string;
  score?: number;
  verdict?: string;  // Add verdict field
  explanation?: string;
  error?: string;
}

export interface EvalResult {
  results: MetricResult[];  // New: array of metric results
  // Legacy fields for backward compatibility
  metric_name?: string;
  score?: number;
  verdict?: string;  // Add verdict field
  explanation?: string;
  error?: string;
}

/**
 * Call DeepEval service to evaluate using specified metric.
 * 
 * Part of the LLM Evaluation Framework - DeepEval provider
 * 
 * The API expects: { query?, context?, output, metric }
 * where:
 * - query: user's question
 * - context: array of retrieved documents/passages
 * - output: LLM generated response
 * - metric: evaluation metric (faithfulness, answer_relevancy, contextual_recall, ragas)
 * 
 * @param contextOrQuery - Context array or query string depending on metric
 * @param output - LLM generated response to evaluate
 * @param metric - Evaluation metric to use
 * @param provider - Optional provider identifier
 * @returns Promise with evaluation results
 */
export async function evalWithMetric(
  contextOrQuery: string | string[],
  output: string,
  metric: string = "faithfulness",
  provider?: string
): Promise<EvalResult> {
  // Validate output
  if (typeof output !== "string" || output.trim() === "") {
    throw new Error("output must be a non-empty string");
  }

  // Build payload for the new API
  const payload: any = {
    output,
    metric,
  };

  // Handle context/query based on metric
  if (metric === "answer_relevancy") {
    // answer_relevancy requires query
    if (typeof contextOrQuery === "string") {
      payload.query = contextOrQuery;
    } else {
      throw new Error("answer_relevancy requires query as string");
    }
  } else if (metric === "faithfulness") {
    // faithfulness works best with context array
    if (Array.isArray(contextOrQuery)) {
      payload.context = contextOrQuery;
    } else if (typeof contextOrQuery === "string") {
      payload.context = [contextOrQuery];  // Convert string to array
    }
  }

  if (provider) {
    payload.provider = provider;
  }

  try {
    const res = await axios.post<EvalResult>(ENV.DEEPEVAL_URL, payload);
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if ((err as any).code === "ECONNREFUSED") {
        throw new Error(
          `DeepEval service unavailable at ${ENV.DEEPEVAL_URL}. Is it running?`
        );
      }
      const errorDetail = err.response?.data?.detail || err.message;
      throw new Error(
        `DeepEval Error (${err.response?.status || 'unknown'}): ${errorDetail}`
      );
    }
    throw err;
  }
}

/**
 * Evaluate with full control over all fields
 */
export async function evalWithFields(params: {
  query?: string;
  context?: string[];
  output?: string;
  expected_output?: string;
  metric?: string;
  provider?: string;
}): Promise<EvalResult> {
  const payload: any = {
    metric: params.metric || "faithfulness",
  };

  // Contextual metrics (contextual_precision, contextual_recall) do not require output
  // They evaluate context quality based on expected_output
  const metricsNotRequiringOutput = ["contextual_precision", "contextual_recall"];
  const metricName = params.metric || "faithfulness";
  
  if (!metricsNotRequiringOutput.includes(metricName) && !params.output) {
    throw new Error("output field is required");
  }
  
  // Only include output if it's provided
  if (params.output) {
    payload.output = params.output;
  }

  if (params.query) payload.query = params.query;
  if (params.context) payload.context = params.context;
  if (params.expected_output) payload.expected_output = params.expected_output;  // NEW: Pass expected_output
  if (params.provider) payload.provider = params.provider;

  console.log(`evalWithFields - Sending payload:`, JSON.stringify(payload, null, 2));

  try {
    const res = await axios.post<EvalResult>(ENV.DEEPEVAL_URL, payload);
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if ((err as any).code === "ECONNREFUSED") {
        throw new Error(
          `DeepEval service unavailable at ${ENV.DEEPEVAL_URL}. Is it running?`
        );
      }
      const errorDetail = err.response?.data?.detail || err.message;
      throw new Error(
        `DeepEval Error (${err.response?.status || 'unknown'}): ${errorDetail}`
      );
    }
    throw err;
  }
}

/**
 * Legacy function for backward compatibility - defaults to faithfulness
 */
export async function evalFaithfulness(
  contextOrQuery: string | string[],
  output: string,
  provider?: string
): Promise<EvalResult> {
  return evalWithMetric(contextOrQuery, output, "faithfulness", provider);
}
//RAGAS
// ...existing code...

