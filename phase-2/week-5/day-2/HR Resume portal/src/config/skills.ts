export const SKILLS = [
	"Java",
	"Selenium",
	"Playwright",
	"API Testing",
	"Postman",
	"SQL",
	"MongoDB",
	"Jenkins",
	"Python",
	"C#",
	"REST Assured",
	"Cucumber",
	"GenAI",
	"Langchain",
	"Langgraph",
	"RAG",
	"Azure DevOps",
	"AWS Lambda",
	"GitHub",
	"DeepEval",
	"MCP (Model Context Protocol)",
];

export function detectSkills(rawText: string): string[] {
	const normalizedText = rawText.toLocaleLowerCase();
	return SKILLS.filter((skill) => normalizedText.includes(skill.toLocaleLowerCase()));
}