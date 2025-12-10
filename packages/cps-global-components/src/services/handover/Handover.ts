import { CaseDetails } from "../data/CaseDetails";
export type HandoverData = { caseDetails: CaseDetails };
export type Handover = { found: true; data: HandoverData } | { found: false; error: any };
