import { z } from 'zod';
export declare const GenerateRequestSchema: z.ZodObject<{
    storyTitle: z.ZodString;
    summary: z.ZodString;
    acceptanceCriteria: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    additionalInfo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    storyTitle: string;
    summary: string;
    acceptanceCriteria: string;
    description?: string | undefined;
    additionalInfo?: string | undefined;
}, {
    storyTitle: string;
    summary: string;
    acceptanceCriteria: string;
    description?: string | undefined;
    additionalInfo?: string | undefined;
}>;
export declare const TestCaseSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodString, "many">;
    testData: z.ZodOptional<z.ZodString>;
    expectedResult: z.ZodString;
    category: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    title: string;
    steps: string[];
    expectedResult: string;
    category: string;
    testData?: string | undefined;
}, {
    id: string;
    title: string;
    steps: string[];
    expectedResult: string;
    category: string;
    testData?: string | undefined;
}>;
export declare const GenerateResponseSchema: z.ZodObject<{
    cases: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        steps: z.ZodArray<z.ZodString, "many">;
        testData: z.ZodOptional<z.ZodString>;
        expectedResult: z.ZodString;
        category: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        title: string;
        steps: string[];
        expectedResult: string;
        category: string;
        testData?: string | undefined;
    }, {
        id: string;
        title: string;
        steps: string[];
        expectedResult: string;
        category: string;
        testData?: string | undefined;
    }>, "many">;
    model: z.ZodOptional<z.ZodString>;
    promptTokens: z.ZodNumber;
    completionTokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    cases: {
        id: string;
        title: string;
        steps: string[];
        expectedResult: string;
        category: string;
        testData?: string | undefined;
    }[];
    promptTokens: number;
    completionTokens: number;
    model?: string | undefined;
}, {
    cases: {
        id: string;
        title: string;
        steps: string[];
        expectedResult: string;
        category: string;
        testData?: string | undefined;
    }[];
    promptTokens: number;
    completionTokens: number;
    model?: string | undefined;
}>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
//# sourceMappingURL=schemas.d.ts.map