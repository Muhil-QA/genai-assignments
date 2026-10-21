import { SearchCandidate } from "../types/retrieval.types";

export const MAX_CANDIDATE_SNIPPET_CHARS = 1200;

export function deduplicateCandidates(candidateLists: SearchCandidate[][]): SearchCandidate[] {
	const candidatesByResumeId = new Map<string, SearchCandidate>();

	for (const candidateList of candidateLists) {
		for (const candidate of candidateList) {
			const existing = candidatesByResumeId.get(candidate.resumeId);
			if (!existing) {
				candidatesByResumeId.set(candidate.resumeId, normalizeSnippet(candidate));
				continue;
			}

			const merged = withoutUndefined({
				...existing,
				name: existing.name ?? candidate.name,
				role: existing.role ?? candidate.role,
				company: existing.company ?? candidate.company,
				skills: mergeUnique(existing.skills, candidate.skills),
				matchedSkills: mergeUnique(existing.matchedSkills, candidate.matchedSkills),
				snippet: limitSnippet(existing.snippet ?? candidate.snippet),
				bm25Score: existing.bm25Score ?? candidate.bm25Score,
				vectorScore: existing.vectorScore ?? candidate.vectorScore,
				sources: [...new Set([...existing.sources, ...candidate.sources])],
			});
			candidatesByResumeId.set(candidate.resumeId, merged);
		}
	}

	return [...candidatesByResumeId.values()];
}

function normalizeSnippet(candidate: SearchCandidate): SearchCandidate {
	if (candidate.snippet === undefined) return candidate;
	return { ...candidate, snippet: limitSnippet(candidate.snippet) };
}

function limitSnippet(snippet: string | undefined): string | undefined {
	return snippet?.slice(0, MAX_CANDIDATE_SNIPPET_CHARS);
}

function mergeUnique<T>(first: T[] | undefined, second: T[] | undefined): T[] | undefined {
	if (!first && !second) return undefined;
	return [...new Set([...(first ?? []), ...(second ?? [])])];
}

function withoutUndefined(candidate: SearchCandidate): SearchCandidate {
	return Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined)) as SearchCandidate;
}