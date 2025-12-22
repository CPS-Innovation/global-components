import { CaseDetails } from "../data/CaseDetails";
import { MonitoringCode } from "../data/MonitoringCode";
export type Handover = { caseId: number; caseDetails?: CaseDetails; monitoringCodes?: MonitoringCode[] };
