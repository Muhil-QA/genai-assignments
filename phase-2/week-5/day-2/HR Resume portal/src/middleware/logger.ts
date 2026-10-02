import { RequestHandler } from "express";

interface IngestionTimings {
	extractMs: number;
	cleanMs: number;
	parseMs: number;
	embeddingMs: number;
	mongoInsertMs: number;
	totalMs: number;
}

export const requestLogger: RequestHandler = (req, res, next) => {
	const startedAt = performance.now();

	res.on("finish", () => {
		const timings = res.locals.ingestionTimings as IngestionTimings | undefined;
		const log = {
			requestId: res.locals.requestId,
			endpoint: req.originalUrl,
			...(req.file?.originalname ? { fileName: req.file.originalname } : {}),
			statusCode: res.statusCode,
			...(timings ?? { totalMs: Math.round(performance.now() - startedAt) }),
		};
		console.log(JSON.stringify(log));
	});

	next();
};