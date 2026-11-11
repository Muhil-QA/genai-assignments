import express from "express";
import cors from "cors";
import { getDatabase } from "./config/database";
import ingestionRoutes from "./modules/ingestion/routes/ingestionRoutes";
import { errorHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { requestLogger } from "./middleware/logger";

const app = express();

app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(cors());
app.use(express.json());
app.use("/v1", ingestionRoutes);

app.get("/v1/health", (_req, res) => {
	res.status(200).json({
		status: "ok",
		app: "resume-rag-backend",
		version: "1.0.0",
		uptime: Number(process.uptime().toFixed(1)),
	});
});

app.get("/v1/health/db", async (_req, res) => {
	const startedAt = performance.now();

	try {
		const database = await getDatabase();
		await database.command({ ping: 1 });
		await database.collection("resumes").findOne({}, { projection: { _id: 1 } });

		res.status(200).json({
			status: "ok",
			database: "mongodb",
			connected: true,
			latencyMs: Math.round(performance.now() - startedAt),
		});
	} catch (error: unknown) {
		const databaseError = error as { name?: string; code?: string | number; codeName?: string };
		console.error("MongoDB health check failed", {
			errorType: databaseError.name ?? "UnknownError",
			errorCode: databaseError.code ?? null,
			codeName: databaseError.codeName ?? null,
		});
		res.status(503).json({
			status: "error",
			success: false,
			database: "mongodb",
			connected: false,
			requestId: res.locals.requestId,
			errorCode: "DB_CONNECTION_FAILED",
		});
	}
});

app.use(errorHandler);

export default app;