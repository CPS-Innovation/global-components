import { CaseDetails } from "../data/CaseDetails";

export type Handover = { found: true; data: { caseDetails: Partial<CaseDetails> } } | { found: false; error: any };
