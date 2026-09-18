"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateResponseSchema = exports.TestCaseSchema = exports.GenerateRequestSchema = void 0;
const zod_1 = require("zod");
exports.GenerateRequestSchema = zod_1.z.object({
    storyTitle: zod_1.z.string().min(1, 'Story title is required'),
    summary: zod_1.z.string().min(1, 'Summary is required'),
    acceptanceCriteria: zod_1.z.string().min(1, 'Acceptance criteria is required'),
    description: zod_1.z.string().optional(),
    additionalInfo: zod_1.z.string().optional()
});
exports.TestCaseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    steps: zod_1.z.array(zod_1.z.string()),
    testData: zod_1.z.string().optional(),
    expectedResult: zod_1.z.string(),
    category: zod_1.z.string()
});
exports.GenerateResponseSchema = zod_1.z.object({
    cases: zod_1.z.array(exports.TestCaseSchema),
    model: zod_1.z.string().optional(),
    promptTokens: zod_1.z.number(),
    completionTokens: zod_1.z.number()
});
//# sourceMappingURL=schemas.js.map