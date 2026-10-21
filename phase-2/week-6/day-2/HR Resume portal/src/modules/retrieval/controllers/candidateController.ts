import { Request, Response } from "express";
import { sendApiError } from "../../../middleware/errorHandler";
import { MongoResumeRepository, ResumeProfileDocument } from "../repositories/ResumeRepository";

type CandidateProfileReader = Pick<MongoResumeRepository, "findProfileById">;

export class CandidateController {
	constructor(private readonly resumeRepository: CandidateProfileReader = new MongoResumeRepository()) {}

	getCandidate = async (req: Request, res: Response): Promise<void> => {
		try {
			const profileId = req.params.id;
			const candidate = await this.resumeRepository.findProfileById(
				typeof profileId === "string" ? profileId : "",
			);
			if (!candidate) {
				sendApiError(res, "CANDIDATE_NOT_FOUND");
				return;
			}

			res.status(200).json(toCandidateProfile(candidate));
		} catch {
			sendApiError(res, "CANDIDATE_LOOKUP_FAILED");
		}
	};
}

function toCandidateProfile(candidate: ResumeProfileDocument) {
	return {
		_id: candidate._id.toHexString(),
		...(candidate.name === undefined ? {} : { name: candidate.name }),
		...(candidate.email === undefined ? {} : { email: candidate.email }),
		...(candidate.phone === undefined ? {} : { phone: candidate.phone }),
		...(candidate.location === undefined ? {} : { location: candidate.location }),
		...(candidate.role === undefined ? {} : { role: candidate.role }),
		...(candidate.company === undefined ? {} : { company: candidate.company }),
		...(candidate.education === undefined ? {} : { education: candidate.education }),
		...(candidate.totalExperience === undefined ? {} : { totalExperience: candidate.totalExperience }),
		...(candidate.relevantExperience === undefined ? {} : { relevantExperience: candidate.relevantExperience }),
		skills: candidate.skills ?? [],
		...(candidate.jobTitles === undefined ? {} : { jobTitles: candidate.jobTitles }),
		...(candidate.experienceSummary === undefined ? {} : { experienceSummary: candidate.experienceSummary }),
		...(candidate.createdAt === undefined ? {} : { processedAt: candidate.createdAt }),
	};
}
