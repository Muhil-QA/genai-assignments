import { Router } from "express";
import { CandidateController } from "../controllers/candidateController";
import { RetrievalController } from "../controllers/retrievalController";

const router = Router();
const retrievalController = new RetrievalController();
const candidateController = new CandidateController();

router.get("/candidate/:id", candidateController.getCandidate);
router.get("/search/readiness", retrievalController.getReadiness);
router.post("/embeddings", retrievalController.createQueryEmbedding);
router.post("/search/bm25", retrievalController.bm25Search);
router.post("/search/vector", retrievalController.vectorSearch);
router.post("/search/hybrid", retrievalController.hybridSearch);
router.post("/search/rerank", retrievalController.rerankCandidates);
router.post("/search/summarize", retrievalController.summarizeCandidate);
router.post("/search", retrievalController.search);

export default router;