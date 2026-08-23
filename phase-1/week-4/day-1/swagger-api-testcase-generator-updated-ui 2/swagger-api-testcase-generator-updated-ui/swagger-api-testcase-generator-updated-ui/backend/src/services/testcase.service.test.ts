import { describe, expect, it } from "vitest";
import { classifyTestCase, summarizeTestCases } from "./testcase.service.js";
import type { ApiTestCase } from "../types/index.js";

type UnclassifiedTestCase = Omit<ApiTestCase, "standardTestTypes">;

function makeCase(overrides: Partial<UnclassifiedTestCase> = {}): UnclassifiedTestCase {
  return {
    testCaseId: "TC-API-001",
    endpoint: "/pets",
    method: "GET",
    category: "positive",
    title: "List pets with valid input",
    priority: "High",
    preconditions: [],
    headers: {},
    pathParameters: {},
    queryParameters: {},
    steps: ["Send the request"],
    expectedStatusCode: 200,
    expectedResult: "The API returns a successful response.",
    sourceReferences: ["paths./pets.get"],
    ...overrides
  };
}

describe("classifyTestCase", () => {
  it("assigns stable baseline and smoke classifications to a core happy path", () => {
    expect(classifyTestCase(makeCase())).toEqual(["Smoke", "Functional", "API/Contract"]);
  });

  it("assigns multiple evidence-based classifications to negative validation cases", () => {
    expect(classifyTestCase(makeCase({
      category: "validation",
      title: "Reject invalid boundary input",
      expectedStatusCode: 400
    }))).toEqual(["Regression", "Functional", "API/Contract", "Validation"]);
  });

  it("does not assign unsupported classifications for an ordinary low-priority case", () => {
    expect(classifyTestCase(makeCase({ priority: "Low" }))).toEqual(["Functional", "API/Contract"]);
  });
});

describe("summarizeTestCases", () => {
  it("counts scenario categories and multiple standard types independently", () => {
    const testCase = {
      ...makeCase(),
      standardTestTypes: classifyTestCase(makeCase())
    };
    const summary = summarizeTestCases([testCase]) as ReturnType<typeof summarizeTestCases> & { positive: number };

    expect(summary.totalTestCases).toBe(1);
    expect(summary.positive).toBe(1);
    expect(summary.standardTestTypes.Smoke).toBe(1);
    expect(summary.standardTestTypes.Functional).toBe(1);
    expect(summary.standardTestTypes["API/Contract"]).toBe(1);
    expect(summary.standardTestTypes.Regression).toBe(0);
  });
});
