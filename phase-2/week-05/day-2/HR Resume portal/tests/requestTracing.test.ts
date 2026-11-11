import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { RequestHandler } from "express";
import { requestIdMiddleware } from "../src/middleware/requestId";
import { requestLogger } from "../src/middleware/logger";

test("assigns and returns a UUID v4 request ID", () => {
	let headerName = "";
	let headerValue = "";
	let nextCalled = false;
	const req = {} as Parameters<typeof requestIdMiddleware>[0];
	const res = {
		locals: {},
		setHeader(name: string, value: string | number | readonly string[]) {
			headerName = name;
			headerValue = String(value);
		},
	} as Parameters<typeof requestIdMiddleware>[1];

	requestIdMiddleware(req, res, () => { nextCalled = true; });

	assert.equal(headerName, "X-Request-Id");
	assert.match(headerValue, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	assert.equal(res.locals.requestId, headerValue);
	assert.equal(nextCalled, true);
});

test("logs request metadata and timings without logging request payloads", () => {
	const response = new EventEmitter() as EventEmitter & {
		locals: Record<string, unknown>;
		statusCode: number;
	};
	response.locals = {
		requestId: "6f30b4aa-5abc-4ac4-9c88-6d6726e01de9",
		ingestionTimings: {
			extractMs: 1,
			cleanMs: 2,
			parseMs: 3,
			embeddingMs: 4,
			mongoInsertMs: 5,
			totalMs: 15,
		},
	};
	response.statusCode = 200;
	const req = {
		originalUrl: "/v1/resume/ingest",
		file: { originalname: "resume.pdf" },
	} as Parameters<RequestHandler>[0];
	const logs: string[] = [];
	const originalLog = console.log;
	console.log = ((entry: string) => logs.push(entry)) as typeof console.log;

	try {
		requestLogger(req, response as Parameters<RequestHandler>[1], () => undefined);
		response.emit("finish");
	} finally {
		console.log = originalLog;
	}

	assert.equal(logs.length, 1);
	const log = JSON.parse(logs[0]) as Record<string, unknown>;
	assert.equal(log.requestId, response.locals.requestId);
	assert.equal(log.endpoint, "/v1/resume/ingest");
	assert.equal(log.fileName, "resume.pdf");
	assert.equal(log.statusCode, 200);
	assert.equal(log.totalMs, 15);
	assert.equal("rawText" in log, false);
	assert.equal("embedding" in log, false);
});