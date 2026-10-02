import assert from "node:assert/strict";
import test from "node:test";
import { detectSkills } from "../src/config/skills";

test("detects configured skills case-insensitively in dictionary order", () => {
	assert.deepEqual(
		detectSkills("Experienced in Selenium WebDriver, Python, RAG, DeepEval and MCP (Model Context Protocol)."),
		["Selenium", "Python", "RAG", "DeepEval", "MCP (Model Context Protocol)"],
	);
});

test("returns an empty list when no dictionary skills are present", () => {
	assert.deepEqual(detectSkills("Leadership and communication skills"), []);
});