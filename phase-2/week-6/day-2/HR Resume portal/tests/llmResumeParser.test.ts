import assert from "node:assert/strict";
import test from "node:test";
import { validateParsedResume } from "../src/modules/ingestion/services/LLMResumeParser";

test("validates and normalizes supported LLM resume fields", () => {
	const resume = validateParsedResume({
		name: "  Amreen Begam A  ",
		email: null,
		totalExperience: 3.5,
		skills: ["Digital Marketing", "Leadership"],
		unknownField: "discarded",
	});

	assert.deepEqual(resume, {
		name: "Amreen Begam A",
		totalExperience: 3.5,
		skills: ["Digital Marketing", "Leadership"],
	});
});

test("rejects malformed LLM resume values", () => {
	assert.throws(() => validateParsedResume({ skills: "Python" }));
	assert.throws(() => validateParsedResume({ skills: [], totalExperience: -1 }));
	assert.throws(() => validateParsedResume({ skills: [], name: 123 }));
});