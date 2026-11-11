import { RequestHandler } from "express";

interface IngestionTimings {
	extractMs: number;
	cleanMs: number;
	parseMs: number;
	embeddingMs: number;
	mongoInsertMs: number;
	totalMs: number;
}

interface RetrievalTimings {
	embeddingMs: number;
	bm25Ms: number;
	vectorMs: number;
	rerankMs: number;
	summarizeMs: number;
	totalMs: number;
}

export const requestLogger: RequestHandler = (req, res, next) => {
	const startedAt = performance.now();

	res.on("finish", () => {
		const retrievalTimings = res.locals.retrievalTimings as RetrievalTimings | undefined;
		const baseLog = {
			requestId: res.locals.requestId,
			endpoint: req.originalUrl,
			method: req.method,
			...(req.file?.originalname ? { fileName: req.file.originalname } : {}),
		};
		const log = retrievalTimings || res.locals.retrievalDegraded === true
			? {
					...baseLog,
					durationMs: Math.round(performance.now() - startedAt),
					statusCode: res.statusCode,
					...(retrievalTimings ? { componentTimings: retrievalTimings } : {}),
					...(res.locals.retrievalDegraded === true ? { degraded: true } : {}),
					...(Array.isArray(res.locals.retrievalWarnings) && res.locals.retrievalWarnings.length > 0
						? { warnings: res.locals.retrievalWarnings }
						: {}),
				}
			: {
					...baseLog,
					statusCode: res.statusCode,
					...((res.locals.ingestionTimings as IngestionTimings | undefined)
						?? { totalMs: Math.round(performance.now() - startedAt) }),
				};
		console.log(JSON.stringify(log));
	});

	next();
};