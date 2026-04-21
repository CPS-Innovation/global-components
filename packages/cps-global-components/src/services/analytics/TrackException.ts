import { ExceptionMeta } from "./ExceptionMeta";

export type TrackException = (exception: Error, meta: ExceptionMeta) => void;
