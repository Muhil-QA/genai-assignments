import assert from "node:assert/strict";
import test from "node:test";
import {
	EMAIL_REGEX,
	EXPERIENCE_REGEX,
	extractExperience,
	PHONE_REGEX,
} from "../src/modules/ingestion/utils/regex";

test("matches valid email addresses", () => {
	assert.equal(EMAIL_REGEX.test("amreenbegam0812@gmail.com"), true);
	assert.equal(EMAIL_REGEX.test("not-an-email"), false);
});

test("matches Indian phone numbers", () => {
	assert.equal(PHONE_REGEX.test("+91 9344374143"), true);
	assert.equal(PHONE_REGEX.test("9344374143"), true);
	assert.equal(PHONE_REGEX.test("12345"), false);
});

test("extracts integer and decimal years of experience", () => {
	assert.equal(extractExperience("13+ years of experience"), 13);
	assert.equal(extractExperience("3.5 yrs experience"), 3.5);
	assert.equal(extractExperience("experience not specified"), undefined);
	assert.equal(EXPERIENCE_REGEX.test("2 years"), true);
});