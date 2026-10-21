export interface ParsedResume {
	name?: string;
	email?: string;
	phone?: string;
	location?: string;
	company?: string;
	role?: string;
	education?: string;
	totalExperience?: number;
	relevantExperience?: number;
	skills: string[];
	jobTitles?: string[];
	experienceSummary?: string;
}

export interface StoreResumeInput {
	fileName: string;
	resume: ParsedResume;
	rawText: string;
	embedding: number[];
}