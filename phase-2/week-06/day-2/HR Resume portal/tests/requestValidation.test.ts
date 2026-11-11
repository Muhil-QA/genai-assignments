import assert from "node:assert/strict";
import test from "node:test";
import { parseSearchFilters } from "../src/modules/retrieval/utils/requestValidation";

test("accepts absent or valid experience filters", () => {
	assert.deepEqual(parseSearchFilters(undefined), {});
	assert.deepEqual(parseSearchFilters({}), {});
	assert.deepEqual(parseSearchFilters({ minYearsExperience: 10 }), { minYearsExperience: 10 });
});

test("rejects malformed and unsupported experience filters", () => {
	for (const filters of [null, [], "10", { minYearsExperience: "10" }, { minYearsExperience: -1 }, { other: true }]) {
		assert.equal(parseSearchFilters(filters), null);
	}
});