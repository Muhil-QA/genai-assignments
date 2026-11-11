import axios, { AxiosError } from 'axios';
import { FormState, LLMEvalResponse, ApiError } from '../components/LLMEval/types';

const BACKEND_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3002';

const backendInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 1200000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Evaluate using RAGAS provider
 * Supports: faithfulness, context_precision, context_recall
 */
export const evaluateWithRagas = async (formData: FormState): Promise<LLMEvalResponse> => {
  try {
    // Filter out empty context items before sending
    const payload = {
      metric: formData.metric === 'ragas_score' ? 'ragas' : formData.metric,
      query: formData.query,
      output: formData.output,
      context: formData.context.filter((ctx) => ctx.trim().length > 0),
      expected_output: formData.expected_output,
    };

    console.log('📤 RAGAS Request:', payload);

    const response = await backendInstance.post<LLMEvalResponse>(
      '/api/ragas/eval-only',
      payload
    );

    console.log('📥 RAGAS Response:', response.data);
    return {
      ...response.data,
      provider: 'ragas' as const,
    };
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string; error?: string; detail?: string }>;

    console.error('❌ RAGAS Error:', axiosError);

    const apiError: ApiError = {
      message: 'Failed to evaluate with RAGAS',
      status: axiosError.response?.status,
      details:
        axiosError.response?.data?.detail ||
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        axiosError.message,
    };

    throw apiError;
  }
};

/**
 * Evaluate using DeepEval provider
 */
export const evaluateWithDeepEval = async (formData: FormState): Promise<LLMEvalResponse> => {
  try {
    const payload = {
      metric: formData.metric,
      query: formData.query,
      output: formData.output,
      context: formData.context.filter((ctx) => ctx.trim().length > 0),
      expected_output: formData.expected_output, // Required for contextual_recall
    };

    console.log('📤 DeepEval Request:', payload);

    // Route through backend for clean response (without results array)
    const response = await backendInstance.post<LLMEvalResponse>(
      '/api/eval-only',
      payload
    );

    console.log('📥 DeepEval Response:', response.data);
    return {
      ...response.data,
      provider: 'deepeval' as const,
    };
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string; error?: string; detail?: string }>;

    console.error('❌ DeepEval Error:', axiosError);

    const apiError: ApiError = {
      message: 'Failed to evaluate with DeepEval',
      status: axiosError.response?.status,
      details:
        axiosError.response?.data?.detail ||
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        axiosError.message,
    };

    throw apiError;
  }
};

/**
 * Universal LLM evaluation function that routes to the correct provider
 */
export const evaluateLLM = async (formData: FormState): Promise<LLMEvalResponse> => {
  if (formData.provider === 'ragas') {
    return evaluateWithRagas(formData);
  } else if (formData.provider === 'deepeval') {
    return evaluateWithDeepEval(formData);
  } else {
    throw new Error(`Unknown LLM evaluation provider: ${formData.provider}`);
  }
};

// Backward compatibility exports (deprecated)
/** @deprecated Use evaluateWithRagas instead */
export const evalRagas = evaluateWithRagas;

/** @deprecated Use evaluateWithDeepEval instead */
export const evalDeepEval = evaluateWithDeepEval;

/** @deprecated Use evaluateLLM instead */
export const evaluate = evaluateLLM;
