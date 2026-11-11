export function cleanResumeText(rawText: string): string {
	const normalizedLines = rawText
		.replace(/\r\n?/g, "\n")
		.replace(/[\t\f\v]/g, " ")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean);

	return normalizedLines.join("\n").trim();
}