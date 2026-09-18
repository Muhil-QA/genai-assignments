export interface GenerateRequest {
  storyTitle: string
  summary: string
  acceptanceCriteria: string
  description?: string
  additionalInfo?: string
}

export interface JiraConnectionRequest {
  baseUrl: string
  email: string
  token: string
}

export interface JiraMappedStory extends GenerateRequest {
  jiraIssueKey?: string
  jiraIssueType?: string
  jiraStatus?: string
  jiraPriority?: string
  jiraAssignee?: string
  jiraReporter?: string
  jiraLabels?: string[]
  jiraStoryPoints?: string
  jiraCreated?: string
  jiraUpdated?: string
  jiraCustomFields?: Record<string, string>
  jiraFieldMetadata?: Record<string, string>
  jiraFields?: Record<string, string>
}

export interface TestCase {
  id: string
  title: string
  steps: string[]
  testData?: string
  expectedResult: string
  category: string
}

export interface GenerateResponse {
  cases: TestCase[]
  model?: string
  promptTokens: number
  completionTokens: number
}