import { ZodError } from "zod";
import { STANDARD_TEST_TYPES, type ApiTestCase, type JsonObject, type StandardTestType, type TestCaseCategory } from "../types/index.js";
import { GroqTestCaseOutputSchema } from "../schemas/llm.schemas.js";
import { callGroqJson, isGroqEnabled } from "./groq.service.js";
import { TEST_CASE_SYSTEM_PROMPT } from "./prompts.js";
import { env } from "../config/environment.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";

type UnclassifiedTestCase = Omit<ApiTestCase, "standardTestTypes">;

function deduplicate(cases: UnclassifiedTestCase[]): UnclassifiedTestCase[] {
  const seen = new Set<string>();
  return cases.filter((testCase) => {
    const key = `${testCase.method}|${testCase.endpoint}|${testCase.category}|${testCase.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const PRIORITY_RANK: Record<ApiTestCase["priority"], number> = { High: 0, Medium: 1, Low: 2 };

// Round-robins across categories (highest priority first within each) so the cap
// spreads across positive/negative/boundary/etc. instead of one category eating the
// whole budget. Cases within a category stay in spec order, which already alternates
// across endpoints, so endpoint coverage stays broad too.
function limitTestCases(cases: UnclassifiedTestCase[], max: number): UnclassifiedTestCase[] {
  if (cases.length <= max) return cases;

  const groups = new Map<string, UnclassifiedTestCase[]>();
  for (const testCase of cases) {
    const group = groups.get(testCase.category);
    if (group) group.push(testCase);
    else groups.set(testCase.category, [testCase]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  }

  const groupList = [...groups.values()];
  const selected: UnclassifiedTestCase[] = [];
  for (let round = 0; selected.length < max && round < Math.max(...groupList.map((g) => g.length)); round++) {
    for (const group of groupList) {
      if (selected.length >= max) break;
      if (round < group.length) selected.push(group[round]);
    }
  }
  return selected;
}

function renumber(cases: ApiTestCase[]): ApiTestCase[] {
  return cases.map((testCase, index) => ({ ...testCase, testCaseId: `TC-API-${String(index + 1).padStart(3, "0")}` }));
}

export function classifyTestCase(testCase: UnclassifiedTestCase | ApiTestCase): StandardTestType[] {
  const text = [
    testCase.category,
    testCase.title,
    testCase.expectedResult,
    ...testCase.preconditions,
    ...testCase.steps,
    ...testCase.sourceReferences
  ].join(" ").toLowerCase();
  const types = new Set<StandardTestType>(["Functional", "API/Contract"]);

  if (testCase.category === "positive" && testCase.priority === "High") types.add("Smoke");
  if (/sanity|quick check|focused|change validation|changed behavior/.test(text)) types.add("Sanity");
  if (["negative", "boundary", "authentication", "authorization", "validation", "error-handling"].includes(testCase.category)) types.add("Regression");
  if (testCase.category === "negative") types.add("Negative");
  if (testCase.category === "boundary") types.add("Boundary");
  if (testCase.category === "validation") types.add("Validation");
  if (["authentication", "authorization"].includes(testCase.category) || /unauthori[sz]ed|forbidden|authentication|authorization|token|credential|permission|security/.test(text)) types.add("Security");
  if (/integration|service interaction|dependent service|database|external service/.test(text)) types.add("Integration");
  if (/end.to.end|user journey|workflow|complete flow|across endpoints/.test(text)) types.add("End-to-End");
  if (/performance|latency|response time|throughput|load test|stress test/.test(text)) types.add("Performance");
  if (/browser|client|mobile|version|backward compatib|cross.platform/.test(text)) types.add("Compatibility");
  if (/usability|user friendly|clear error|readable response/.test(text)) types.add("Usability");
  if (/exploratory|investigate|unknown behavior/.test(text)) types.add("Exploratory");

  return STANDARD_TEST_TYPES.filter((type) => types.has(type));
}

async function groqCases(specification: JsonObject, categories: TestCaseCategory[]) {
  const system = TEST_CASE_SYSTEM_PROMPT;
  const user = JSON.stringify({ categories, specification });
  const output = await callGroqJson(system, user);
  try {
    return GroqTestCaseOutputSchema.parse(output).testCases;
  } catch (error) {
    if (error instanceof ZodError) {
      logger.error({ issues: error.issues.slice(0, 10) }, "Groq output did not match the test-case schema.");
      throw new AppError(
        502,
        "GROQ_OUTPUT_INVALID",
        "Groq returned test cases that do not match the required schema.",
        { issues: error.issues.slice(0, 10) }
      );
    }
    throw error;
  }
}

function finalize(cases: UnclassifiedTestCase[]): ApiTestCase[] {
  const classified = limitTestCases(deduplicate(cases), env.MAX_TEST_CASES).map((testCase) => ({
    ...testCase,
    standardTestTypes: classifyTestCase(testCase)
  }));
  return renumber(classified);
}

// Test cases are generated exclusively by Groq (the LLM). There is intentionally no
// hardcoded/deterministic fallback: if Groq is not configured or the request fails,
// generation errors out so the application never returns non-LLM results.
export async function generateTestCases(specification: JsonObject, categories: TestCaseCategory[]) {
  if (!isGroqEnabled()) {
    throw new AppError(
      503,
      "GROQ_NOT_CONFIGURED",
      "Groq is not configured. Set GROQ_API_KEY and GROQ_MODEL in the backend .env to generate test cases."
    );
  }

  const generated = await groqCases(specification, categories);
  if (generated.length === 0) {
    throw new AppError(502, "GROQ_EMPTY_RESULT", "Groq returned no test cases for the supplied specification.");
  }

  logger.info({ count: generated.length, model: env.GROQ_MODEL }, "Generated test cases with Groq.");
  return { testCases: finalize(generated), source: "groq" as const, model: env.GROQ_MODEL };
}

export function summarizeTestCases(testCases: ApiTestCase[]) {
  const categoryCounts = Object.fromEntries([
    "positive", "negative", "boundary", "authentication", "authorization", "validation", "error-handling"
  ].map((category) => [category, testCases.filter((testCase) => testCase.category === category).length])) as Record<TestCaseCategory, number>;
  const standardTypeCounts = Object.fromEntries(
    STANDARD_TEST_TYPES.map((type) => [type, testCases.filter((testCase) => (testCase.standardTestTypes ?? []).includes(type)).length])
  ) as Record<StandardTestType, number>;
  return { totalTestCases: testCases.length, ...categoryCounts, standardTestTypes: standardTypeCounts };
}
