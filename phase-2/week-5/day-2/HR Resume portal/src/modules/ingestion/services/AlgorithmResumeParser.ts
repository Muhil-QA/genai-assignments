import { detectSkills } from "../../../config/skills";
import { EMAIL_REGEX, EXPERIENCE_REGEX, extractExperience, PHONE_REGEX } from "../utils/regex";
import { ParsedResume } from "../types/ingestion.types";

const NAME_EXCLUSIONS = new Set([
	"education",
	"profile summary",
	"academic project",
	"professional skill",
	"professional skills",
	"technical skills",
	"experience",
	"internship",
	"certifications",
	"diploma certifications",
]);

function findLabeledValue(lines: string[], label: RegExp): string | undefined {
	for (const line of lines) {
		const match = line.match(label);
		if (match?.[1]?.trim()) {
			return match[1].trim();
		}
	}
	return undefined;
}

function findName(lines: string[]): string | undefined {
	const explicitName = findLabeledValue(lines, /^\s*name\s*[:\-]\s*(.+)$/i);
	if (explicitName) return explicitName;

	const emailLine = lines.findIndex((line) => EMAIL_REGEX.test(line));
	const candidates = (emailLine >= 0 ? lines.slice(Math.max(0, emailLine - 6), emailLine) : lines.slice(0, 8))
		.filter((line) => {
			const normalized = line.toLowerCase().trim();
			const words = line.trim().split(/\s+/);
			return words.length >= 2
				&& words.length <= 5
				&& /^[\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){1,4}$/u.test(line.trim())
				&& !NAME_EXCLUSIONS.has(normalized);
		});

	return candidates.find((line) => line === line.toLocaleUpperCase()) ?? candidates.at(-1);
}

function findEducation(lines: string[]): string | undefined {
	return findLabeledValue(lines, /^\s*education\s*[:\-]\s*(.+)$/i)
		?? lines.find((line) => /\b(?:bachelor|master|b\.?\s?tech|b\.?\s?e\.?|m\.?\s?tech|m\.?\s?b\.?\s?a\.?|b\.?\s?b\.?\s?a\.?|diploma|ph\.?\s?d\.?)\b/i.test(line));
}

export class AlgorithmResumeParser {
	parseResume(rawText: string): ParsedResume {
		const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		const email = rawText.match(EMAIL_REGEX)?.[0];
		const phone = rawText.match(PHONE_REGEX)?.[0]?.trim();
		const role = findLabeledValue(lines, /^\s*(?:current\s+)?(?:job\s+)?(?:role|title|position)\s*[:\-]\s*(.+)$/i);
		const company = findLabeledValue(lines, /^\s*(?:company|employer|organization)\s*[:\-]\s*(.+)$/i);
		const location = findLabeledValue(lines, /^\s*(?:location|city|address)\s*[:\-]\s*(.+)$/i);
		const totalExperience = extractExperience(rawText);
		const relevantExperienceText = findLabeledValue(lines, /^\s*relevant\s+experience\s*[:\-]\s*(.+)$/i);
		const relevantExperience = relevantExperienceText
			? extractExperience(relevantExperienceText)
			: undefined;
		const experienceSummary = findLabeledValue(lines, /^\s*experience\s+summary\s*[:\-]\s*(.+)$/i);
		const skills = detectSkills(rawText);

		if (/\bselenium\s+webdriver\b/i.test(rawText)) {
			const index = skills.indexOf("Selenium");
			if (index >= 0) skills.splice(index, 1);
			skills.unshift("Selenium WebDriver");
		}
		if (/\bcore\s+java\b/i.test(rawText)) {
			const index = skills.indexOf("Java");
			if (index >= 0) skills.splice(index, 1);
			skills.push("Core Java");
		}

		const parsedResume: ParsedResume = { skills };
		const name = findName(lines);
		const education = findEducation(lines);
		const jobTitles = role ? [role] : undefined;

		if (name) parsedResume.name = name;
		if (email) parsedResume.email = email;
		if (phone) parsedResume.phone = phone;
		if (location) parsedResume.location = location;
		if (company) parsedResume.company = company;
		if (role) parsedResume.role = role;
		if (education) parsedResume.education = education;
		if (totalExperience !== undefined && EXPERIENCE_REGEX.test(rawText)) parsedResume.totalExperience = totalExperience;
		if (relevantExperience !== undefined) parsedResume.relevantExperience = relevantExperience;
		if (jobTitles) parsedResume.jobTitles = jobTitles;
		if (experienceSummary) parsedResume.experienceSummary = experienceSummary;

		return parsedResume;
	}
}