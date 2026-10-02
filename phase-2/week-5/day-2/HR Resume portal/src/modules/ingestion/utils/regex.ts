export const EMAIL_REGEX =
	/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export const PHONE_REGEX =
	/(\+91[\-\s]?)?[0]?(91)?[789]\d{9}/;

export const EXPERIENCE_REGEX =
	/(\d+(\.\d+)?)\s*\+?\s*(years|yrs)\b/i;

export function extractExperience(text: string): number | undefined {
	const match = text.match(EXPERIENCE_REGEX);
	return match ? Number(match[1]) : undefined;
}