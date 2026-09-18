export type ValidationIssue = {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationReport = {
  isValid: boolean;
  openApiVersion?: string;
  errorCount: number;
  warningCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type CorrectionChange = {
  path: string;
  issue: string;
  correction: string;
  confidence: number;
};

export type CorrectionReport = {
  correctionStatus: string;
  source: string;
  isCorrectedSpecificationValid: boolean;
  changes: CorrectionChange[];
  remainingErrors: ValidationIssue[];
};

export type ApiTestCase = {
  testCaseId: string;
  operationId?: string;
  endpoint: string;
  method: string;
  category: string;
  standardTestTypes?: StandardTestType[];
  title: string;
  priority: "High" | "Medium" | "Low";
  preconditions: string[];
  headers: Record<string, unknown>;
  pathParameters: Record<string, unknown>;
  queryParameters: Record<string, unknown>;
  requestBody?: unknown;
  steps: string[];
  expectedStatusCode: number;
  expectedResult: string;
  sourceReferences: string[];
};

export type StandardTestType =
  | "Smoke"
  | "Sanity"
  | "Regression"
  | "Functional"
  | "Integration"
  | "End-to-End"
  | "API/Contract"
  | "Validation"
  | "Negative"
  | "Boundary"
  | "Security"
  | "Performance"
  | "Compatibility"
  | "Usability"
  | "Exploratory";

export const STANDARD_TEST_TYPES: StandardTestType[] = [
  "Smoke", "Sanity", "Regression", "Functional", "Integration", "End-to-End",
  "API/Contract", "Validation", "Negative", "Boundary", "Security", "Performance",
  "Compatibility", "Usability", "Exploratory"
];

export type TestcaseSummary = {
  totalTestCases: number;
  positive: number;
  negative: number;
  boundary: number;
  authentication: number;
  authorization: number;
  validation: number;
  "error-handling": number;
  standardTestTypes: Record<StandardTestType, number>;
};

export type GenerationInfo = {
  generationSource: string;
  generationModel?: string;
};
