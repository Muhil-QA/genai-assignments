import { randomUUID } from "node:crypto";
import path from "node:path";
import { RequestHandler } from "express";
import multer from "multer";

const pdfMimeType = "application/pdf";

export function uploadSingleFile(maximumFileSizeBytes: number): RequestHandler {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: 1,
      fileSize: maximumFileSizeBytes,
      fields: 0,
      parts: 1,
    },
  }).single("file");

  return (req, res, next) => {
    parser(req, res, (error: unknown) => {
      if (error) {
        next(error);
        return;
      }

      next();
    });
  };
}

export const validateUploadedPdf: RequestHandler = (req, res, next) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({
      requestId: res.locals.requestId,
      error: "FILE_REQUIRED",
    });
    return;
  }

  const reject = (status: number, error: string) => {
    file.buffer.fill(0);
    res.status(status).json({
      requestId: res.locals.requestId,
      error,
    });
  };

  if (file.buffer.length === 0) {
    reject(400, "CORRUPT_FILE");
    return;
  }

  const filename = file.originalname;
  if (
    filename.length === 0 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0") ||
    filename.includes(":") ||
    path.basename(filename) !== filename ||
    path.win32.basename(filename) !== filename
  ) {
    reject(400, "INVALID_FILENAME");
    return;
  }

  if (
    path.extname(filename).toLowerCase() !== ".pdf" ||
    file.mimetype.toLowerCase() !== pdfMimeType
  ) {
    reject(415, "UNSUPPORTED_FILE_TYPE");
    return;
  }

  if (!file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    reject(415, "FILE_SIGNATURE_MISMATCH");
    return;
  }

  const tail = file.buffer.subarray(Math.max(0, file.buffer.length - 1024));
  const eofIndex = tail.lastIndexOf(Buffer.from("%%EOF"));
  const eofPosition = file.buffer.length - tail.length + eofIndex;
  const startXrefIndex = file.buffer.lastIndexOf(Buffer.from("startxref"));
  if (
    eofIndex < 0 ||
    startXrefIndex < 5 ||
    startXrefIndex >= eofPosition
  ) {
    reject(400, "CORRUPT_FILE");
    return;
  }

  res.locals.uploadedFile = {
    safeFilename: `${randomUUID()}.pdf`,
    detectedType: pdfMimeType,
  };
  file.buffer.fill(0);
  next();
};
