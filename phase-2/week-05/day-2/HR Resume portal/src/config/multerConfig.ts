import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { env } from "./env";

export const uploadsDirectory = path.resolve(process.cwd(), "uploads");

mkdirSync(uploadsDirectory, { recursive: true });

export class InvalidFileTypeError extends Error {
	constructor() {
		super("Only PDF files are allowed");
		this.name = "InvalidFileTypeError";
	}
}

const storage = multer.diskStorage({
	destination: uploadsDirectory,
	filename: (_req, _file, callback) => callback(null, `${randomUUID()}.pdf`),
});

export const upload = multer({
	storage,
	limits: { fileSize: env.maxUploadSizeBytes, files: 1 },
	fileFilter: (_req, file, callback) => {
		const hasPdfExtension = path.extname(file.originalname).toLowerCase() === ".pdf";
		if (hasPdfExtension && file.mimetype === "application/pdf") {
			callback(null, true);
			return;
		}

		callback(new InvalidFileTypeError());
	},
});