import express, { Request, Response, NextFunction } from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import evalRoutes from "./routes/evalRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env from root directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { ENV } from "./config/env.js";

const app = express();

// Configuration from .env
const PORT = process.env.PORT || 3002;
const RAGAS_URL = process.env.RAGAS_URL || "http://localhost:8001";
const NODE_ENV = process.env.NODE_ENV || "development";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Mount evaluation routes (from evalRoutes.ts)
app.use("/api", evalRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "Testleaf LLM Evaluation Framework",
    message: "Multi-provider evaluation API is running",
    version: "1.0.0",
    environment: NODE_ENV,
    providers: {
      ragas: {
        status: "active",
        metrics: ["faithfulness", "context_precision", "context_recall", "ragas_score"],
        endpoint: "/api/ragas/eval-only"
      },
      deepeval: {
        status: "active",
        metrics: ["faithfulness", "answer_relevancy", "contextual_precision", "contextual_recall", "pii_leakage", "bias", "hallucination", "ragas"],
        endpoint: "/api/eval-only"
      }
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// RAGAS EVALUATION ENDPOINT
// ============================================
app.post("/api/ragas/eval-only", async (req: Request, res: Response) => {
  try {
    console.log("📊 [RAGAS] Evaluation Request:", {
      metric: req.body.metric,
      query: req.body.query?.substring(0, 50) + "...",
      contextCount: req.body.context?.length,
    });

    const metric = req.body.metric;
    const isContextPrecision = metric === 'context_precision' || metric === 'contextual_precision';
    const isContextRecall = metric === 'context_recall' || metric === 'contextual_recall';
    const isContextQuality = isContextPrecision || isContextRecall;
    const isRagasScore = metric === 'ragas_score' || metric === 'ragas';
    const isAnswerRelevancy = metric === 'answer_relevancy';

    // Validate request
    const missingFields: string[] = [];
    if (!metric) missingFields.push("metric");
    if (metric && metric !== 'context_recall' && metric !== 'contextual_recall' && !req.body.query) {
      missingFields.push("query");
    }
    if (!isContextQuality && !req.body.output) missingFields.push("output");
    if (!isAnswerRelevancy && !req.body.context) missingFields.push("context");
    if ((isContextQuality || isRagasScore) && !req.body.expected_output) missingFields.push("expected_output");

    if (missingFields.length > 0) {
      console.warn("⚠️ [RAGAS] Missing required fields:", missingFields);
      return res.status(400).json({
        error: "Validation Error",
        message: "Missing required fields for RAGAS evaluation",
        required: missingFields,
        provider: "ragas"
      });
    }

    // Forward to Python server /eval route
    const response = await axios.post(
      ENV.DEEPEVAL_URL,
      req.body,
      {
        timeout: 60000, // 60 second timeout
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ [RAGAS] Evaluation completed successfully");
    console.log(`   └─ Metric: ${response.data.metric}, Score: ${response.data.score}`);

    res.json({
      ...response.data,
      provider: "ragas",
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("❌ [RAGAS] Evaluation failed:", error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.details || error.message;

    res.status(statusCode).json({
      error: "RAGAS Evaluation Failed",
      message: "Failed to evaluate using RAGAS provider",
      details: errorMessage,
      provider: "ragas",
      ragas_url: RAGAS_URL,
    });
  }
});

// ============================================
// GET AVAILABLE METRICS
// ============================================
app.get("/api/ragas/metrics", async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${RAGAS_URL}/ragas/metrics`);
    res.json(response.data);
  } catch (error: any) {
    console.error("❌ Failed to fetch metrics:", error.message);
    res.status(500).json({
      error: "Failed to fetch metrics",
      details: error.message,
      available_metrics: ["faithfulness", "context_precision", "context_recall", "ragas_score"],
    });
  }
});

// ============================================
// BACKEND STATUS
// ============================================
app.get("/api/status", (req: Request, res: Response) => {
  res.json({
    service: "Testleaf LLM Evaluation Framework",
    version: "1.0.0",
    backend: {
      status: "running",
      port: PORT,
      environment: NODE_ENV,
    },
    providers: {
      ragas: {
        url: RAGAS_URL,
        status: "configured",
        metrics: ["faithfulness", "context_precision", "context_recall", "ragas_score"]
      },
      deepeval: {
        status: "configured",
        metrics: ["faithfulness", "answer_relevancy", "contextual_precision", "contextual_recall", "pii_leakage", "bias", "hallucination", "ragas"]
      }
    },
    endpoints: {
      health: "GET /health",
      ragas: "POST /api/ragas/eval-only",
      deepeval: "POST /api/eval-only",
      metrics: "GET /api/ragas/metrics",
      status: "GET /api/status",
    },
  });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    method: req.method,
    availableEndpoints: {
      health: "GET /health",
      deepeval: "POST /api/eval-only",
      evaluate: "POST /api/ragas/eval-only",
      metrics: "GET /api/ragas/metrics",
      status: "GET /api/status",
    },
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error("[ERROR]", err);

  const error = err as Error & { status?: number };
  const status = error.status || 500;
  const message = error.message || "Internal Server Error";

  res.status(status).json({
    error: message,
    status,
    environment: NODE_ENV,
    ...(NODE_ENV === "development" && { stack: error.stack }),
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('🚀 ═══════════════════════════════════════════════════');
  console.log('🤖 Testleaf LLM Evaluation Framework Backend Active');
  console.log('🚀 ═══════════════════════════════════════════════════');
  console.log(`📡 Backend REST API Server : http://localhost:${PORT}`);
  console.log(`🏥 API Health Check Endpoint: http://localhost:${PORT}/health`);
  console.log(`💻 React Frontend Interface : http://localhost:5173 (or 5174/5175 if occupied)`);
  console.log(`🐍 Python FastAPI Judge Server: http://localhost:8002`);
  console.log('📊 Evaluation Providers Registered:');
  console.log(`   ├─ RAGAS Metrics Endpoint: http://localhost:${PORT}/api/ragas/eval-only`);
  console.log(`   └─ DeepEval Metrics Endpoint: http://localhost:${PORT}/api/eval-only`);
  console.log('🚀 ═══════════════════════════════════════════════════');
});

export default app;