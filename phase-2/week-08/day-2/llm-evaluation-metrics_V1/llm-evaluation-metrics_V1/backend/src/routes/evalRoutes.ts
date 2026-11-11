import { Router, Request, Response, NextFunction } from "express";
import { callLLM, getProvider } from "../services/llmClient.js";
import { evalWithMetric, evalWithFields, evalFaithfulness } from "../services/evalClient.js";
import { retrieveContext } from "../services/ragService.js";
import { ENV } from "../config/env.js";

const router = Router();

/**
 * Error handler middleware for async routes
 */
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

/**
 * POST /api/llm/eval
 * LLM-only evaluation endpoint
 *
 * Request body:
 * {
 *   prompt: string (required),
 *   model?: string (optional, defaults to llama-3.3-70b-versatile),
 *   temperature?: number (optional, defaults to 0.7),
 *   metric?: string (optional, defaults to 'answer_relevancy')
 * }
 *
 * Response:
 * {
 *   prompt: string,
 *   model: string,
 *   provider: string,
 *   llmResponse: string,
 *   evaluation: { metric, score, explanation }
 * }
 */
router.post(
  "/llm/eval",
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model, temperature, metric } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({
        error: "Missing required field: prompt"
      });
    }

    // Validate temperature if provided
    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return res.status(400).json({
        error: "Temperature must be a number between 0 and 2"
      });
    }

    // Determine effective parameters
    const effectiveModel = model || "llama-3.3-70b-versatile";
    const effectiveTemperature = temperature !== undefined ? temperature : 0.7;
    const effectiveMetric = metric || "answer_relevancy"; // Changed default from faithfulness

    // Call LLM
    const llmResponse = await callLLM(prompt, effectiveModel, effectiveTemperature);
    console.log("LLM Response:", llmResponse);

    // Determine provider based on model
    const provider = getProvider(effectiveModel);

    // Evaluate with DeepEval using specified metric
    // For LLM-only (no RAG), answer_relevancy makes most sense
    // query = prompt, output = llmResponse
    const evalResult = await evalWithFields({
      query: prompt,
      output: llmResponse,
      metric: effectiveMetric,
      provider
    });
    console.log("Evaluation Result:", evalResult);

    // Use legacy fields for backward compatibility (populated from first successful result)
    res.json({
      prompt,
      model: effectiveModel,
      temperature: effectiveTemperature,
      provider,
      llmResponse,
      evaluation: {
        metric: evalResult.metric_name,
        score: evalResult.score,
        explanation: evalResult.explanation,
        // Include results array if available for multi-metric support
        ...(evalResult.results && { results: evalResult.results })
      }
    });
  })
);

/**
 * POST /api/rag/eval
 * RAG + LLM evaluation endpoint
 *
 * Request body:
 * {
 *   query: string (required),
 *   model?: string (optional, defaults to llama-3.3-70b-versatile),
 *   temperature?: number (optional, defaults to 0.7),
 *   metric?: string (optional, defaults to 'faithfulness')
 * }
 *
 * Response:
 * {
 *   query: string,
 *   context: string,
 *   prompt: string,
 *   llmResponse: string,
 *   evaluation: { metric, score, explanation }
 * }
 */
router.post(
  "/rag/eval",
  asyncHandler(async (req: Request, res: Response) => {
    const { query, model, temperature, metric } = req.body;

    // Validation
    if (!query) {
      return res.status(400).json({
        error: "Missing required field: query"
      });
    }

    // Validate temperature if provided
    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return res.status(400).json({
        error: "Temperature must be a number between 0 and 2"
      });
    }

    // Determine effective parameters
    const effectiveModel = model || "llama-3.3-70b-versatile";
    const effectiveTemperature = temperature !== undefined ? temperature : 0.7;
    const effectiveMetric = metric || "faithfulness";

    // 1. Retrieve context from RAG
    const contextStr = await retrieveContext(query);

    // 2. Build RAG prompt
    const ragPrompt = `You are a helpful QA assistant. Using ONLY the following context, answer the question as accurately as possible. If the context does not contain the answer, say "I don't have enough information to answer that."

CONTEXT:
${contextStr}

QUESTION:
${query}

ANSWER:`;

    // 3. Call LLM with RAG prompt
    const llmResponse = await callLLM(ragPrompt, effectiveModel, effectiveTemperature);

    // Determine provider based on model
    const provider = getProvider(effectiveModel);

    // 4. Evaluate using specified metric
    // For RAG, we have context (as array) and output
    const evalResult = await evalWithFields({
      context: [contextStr], // Convert string to array
      output: llmResponse,
      metric: effectiveMetric,
      provider
    });

    res.json({
      query,
      context: contextStr,
      prompt: ragPrompt,
      model: effectiveModel,
      temperature: effectiveTemperature,
      provider,
      llmResponse,
      evaluation: {
        metric: evalResult.metric_name,
        score: evalResult.score,
        explanation: evalResult.explanation,
        // Include results array if available for multi-metric support
        ...(evalResult.results && { results: evalResult.results })
      }
    });
  })
);

/**
 * GET /health
 * Health check endpoint
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /eval-only
 * DeepEval evaluation endpoint (same format as RAGAS)
 * 
 * Request body:
 * {
 *   query?: string - the input question,
 *   output?: string - the response to evaluate (required for most metrics, NOT required for contextual_precision and contextual_recall),
 *   context?: string | string[] - context for faithfulness evaluation,
 *   expected_output?: string - reference/expected answer (required for contextual_precision and contextual_recall),
 *   metric?: string (optional, defaults to 'answer_relevancy')
 * }
 *
 * Response:
 * {
 *   metric: string,
 *   score: number,
 *   verdict: string,
 *   explanation: string,
 *   query?: string,
 *   output?: string (not included for contextual metrics),
 *   context?: string[]
 * }
 */
router.post(
  "/eval-only",
  asyncHandler(async (req: Request, res: Response) => {
    const { query, output, context, metric, expected_output } = req.body;

    // Validation
    // Output is NOT required for contextual_precision and contextual_recall (context quality metrics)
    const effectiveMetric = metric || "answer_relevancy";
    const metricsNotRequiringOutput = ["contextual_precision", "contextual_recall"];
    
    if (!metricsNotRequiringOutput.includes(effectiveMetric) && !output) {
      return res.status(400).json({
        error: "Missing required field: output"
      });
    }
    if (effectiveMetric === "pii_leakage" && !query) {
      return res.status(400).json({
        error: "Missing required field: query (required for pii_leakage metric)"
      });
    }
    if (effectiveMetric === "bias" && !query) {
      return res.status(400).json({
        error: "Missing required field: query (required for bias metric)"
      });
    }
    if (effectiveMetric === "hallucination" && !query) {
      return res.status(400).json({
        error: "Missing required field: query (required for hallucination metric)"
      });
    }
    if (effectiveMetric === "hallucination" && !context) {
      return res.status(400).json({
        error: "Missing required field: context (required for hallucination metric)"
      });
    }
    if (effectiveMetric === "hallucination" && Array.isArray(context) && context.length === 0) {
      return res.status(400).json({
        error: "Context cannot be empty for hallucination metric (requires at least one context item)"
      });
    }

    try {
      // Build evaluation parameters
      const evalParams: any = {
        metric: effectiveMetric,
        provider: req.body.provider || "groq",  // Use provider from request, default to groq
        output: output
      };

      if (query) evalParams.query = query;
      if (context) evalParams.context = Array.isArray(context) ? context : [context];
      if (expected_output) evalParams.expected_output = expected_output;

      console.log(`DeepEval - Metric: ${effectiveMetric}`);
      console.log(`DeepEval - Full evalParams:`, JSON.stringify(evalParams, null, 2));
      if (query) console.log(`Query: ${query.substring(0, 80)}...`);
      if (output) console.log(`Output: ${output.substring(0, 80)}...`);
      if (context) console.log(`Context:`, JSON.stringify(context, null, 2));

      // Evaluate using DeepEval
      const evalResult = await evalWithFields(evalParams);

      console.log("DeepEval Raw Response:", JSON.stringify(evalResult, null, 2));

      // The Python API returns: { results: [...], metric_name, score, explanation }
      // Extract verdict from results array (it's not at top level)
      let verdict: string | undefined = undefined;
      
      if (evalResult.results && Array.isArray(evalResult.results) && evalResult.results.length > 0) {
        const firstResult = evalResult.results[0];
        verdict = firstResult.verdict;
        console.log("✓ Extracted verdict from results[0]:", verdict);
      }

      // Return in same format as RAGAS for frontend consistency
      const response: any = {
        metric: evalResult.metric_name || effectiveMetric,
        score: evalResult.score,
        verdict: verdict,  // Include verdict from results array
        explanation: evalResult.explanation || (evalResult.results?.[0]?.error ? `Evaluation Error: ${evalResult.results[0].error}` : undefined),
        output: output
      };

      if (query) response.query = query;
      if (evalParams.context) response.context = evalParams.context;

      console.log("Backend Response being sent to frontend:", JSON.stringify(response, null, 2));
      res.json(response);

    } catch (error) {
      console.error("DeepEval evaluation error:", error);
      res.status(500).json({
        error: "DeepEval evaluation failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  })
);



/**
 * GET /metrics
 * Get available evaluation metrics for training
 */
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    // Fetch metrics info from Deepeval service
    const response = await fetch(`${ENV.DEEPEVAL_URL.replace('/eval', '/metrics-info')}`);
    const metricsInfo = await response.json();
    
    res.json({
      ...metricsInfo,
      usage_examples: {
        faithfulness: "Measures alignment with provided context - ideal for RAG systems",
        answer_relevancy: "Measures how well the answer addresses the question - good for QA systems"
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Could not fetch metrics information",
      available_metrics: ["faithfulness", "answer_relevancy"]
    });
  }
});

export default router;
