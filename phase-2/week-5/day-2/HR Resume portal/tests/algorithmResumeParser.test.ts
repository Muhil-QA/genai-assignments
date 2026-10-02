import assert from "node:assert/strict";
import test from "node:test";
import { AlgorithmResumeParser } from "../src/modules/ingestion/services/AlgorithmResumeParser";

const parser = new AlgorithmResumeParser();

test("extracts supported fields from labeled resume text", () => {
	const parsed = parser.parseResume([
		"Name: Rajesh Mohan Kumar",
		"Email: rajesh@example.com",
		"Phone: +91 9344374143",
		"Role: Test Architect & Senior Agentic Test Engineer",
		"Company: Testleaf Software Solutions Private Limited",
		"Education: B.Tech - Information Technology",
		"13+ years of experience",
		"Selenium WebDriver, Core Java, C#, Python, REST Assured, Postman, RAG, DeepEval, MCP (Model Context Protocol)",
	].join("\n"));

	assert.equal(parsed.name, "Rajesh Mohan Kumar");
	assert.equal(parsed.email, "rajesh@example.com");
	assert.equal(parsed.phone, "+91 9344374143");
	assert.equal(parsed.role, "Test Architect & Senior Agentic Test Engineer");
	assert.equal(parsed.company, "Testleaf Software Solutions Private Limited");
	assert.equal(parsed.education, "B.Tech - Information Technology");
	assert.equal(parsed.totalExperience, 13);
	assert.ok(parsed.skills.includes("Selenium WebDriver"));
	assert.ok(parsed.skills.includes("Core Java"));
});

test("omits unsupported fields instead of inventing them", () => {
	const parsed = parser.parseResume([
		"Education",
		"Profile Summary",
		"Academic Project",
		"Professional Skill",
		"AMREEN BEGAM A",
		"amreenbegam0812@gmail.com",
		"+91 9344374143",
		"Theivanai Ammal College for Women",
		"Bachelor Of Business Administration",
		"Organization: Nextgen Solutions, Puducherry",
	].join("\n"));

	assert.equal(parsed.name, "AMREEN BEGAM A");
	assert.equal(parsed.email, "amreenbegam0812@gmail.com");
	assert.equal(parsed.education, "Bachelor Of Business Administration");
	assert.equal(parsed.company, "Nextgen Solutions, Puducherry");
	assert.equal("role" in parsed, false);
	assert.equal("totalExperience" in parsed, false);
});