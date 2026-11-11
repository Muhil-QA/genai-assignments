import { open, unlink } from "node:fs/promises";
import { Router } from "express";
import { upload } from "../../../config/multerConfig";
import { IngestionApiError } from "../../../middleware/errorHandler";
import { cleanResume, detectResumeSkills, embedResume, extractResumeText, getIngestionHealth, ingestResume, parseResume, parseResumeWithLlm, storeResume, uploadResume } from "../controllers/ingestionController";

const router = Router();

const uploadSingleResume: import("express").RequestHandler = (req, res, next) => {
	upload.single("file")(req, res, (error: unknown) => {
		next(error);
	});
};

const verifyPdfSignature: import("express").RequestHandler = async (req, res, next) => {
	if (!req.file) {
		next();
		return;
	}

	const fileHandle = await open(req.file.path, "r");
	const header = Buffer.alloc(5);
	let bytesRead = 0;
	try {
		({ bytesRead } = await fileHandle.read(header, 0, header.length, 0));
	} finally {
		await fileHandle.close();
	}

	if (bytesRead !== header.length || header.toString("ascii") !== "%PDF-") {
		await unlink(req.file.path);
		next(new IngestionApiError("INVALID_FILE_TYPE"));
		return;
	}

	next();
};

router.get("/resume/health", getIngestionHealth);
router.post("/resume/upload", uploadSingleResume, verifyPdfSignature, uploadResume);
router.post("/resume/extract", uploadSingleResume, verifyPdfSignature, extractResumeText);
router.post("/resume/clean", cleanResume);
router.post("/resume/skills", detectResumeSkills);
router.post("/resume/parse", parseResume);
router.post("/resume/llm-parse", parseResumeWithLlm);
router.post("/resume/embed", embedResume);
router.post("/resume/store", storeResume);
router.post("/resume/ingest", uploadSingleResume, verifyPdfSignature, ingestResume);

export default router;