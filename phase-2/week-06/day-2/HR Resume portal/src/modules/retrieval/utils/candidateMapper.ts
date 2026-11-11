import { SearchCandidate, StoredResume } from "../types/retrieval.types";

export type CandidateMapper = (resume: StoredResume) => SearchCandidate;