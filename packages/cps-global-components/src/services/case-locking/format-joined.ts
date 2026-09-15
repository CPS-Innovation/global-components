import { CCPJoined } from "cps-global-presence";

/**
 * When someone arrived, said the way a person would say it.
 *
 *   today      "3.38pm"
 *   yesterday  "3.38pm yesterday"
 *   before     "3.38pm on 21 September 2026"
 *
 * The date is noise on the common case. Almost everyone this reports on arrived
 * minutes ago, and "3.38pm on 8 September 2026" makes the reader check the date
 * before realising it says "this afternoon". Naming the day only when it is not
 * today puts the emphasis where the information is.
 *
 * GDS style for the parts that remain: no leading zero on the hour, a full stop
 * rather than a colon, lower-case am/pm, and the month spelled out. Rendered in the
 * reader's local time, which is what "since" means to them — and compared in local
 * time too, so "today" means the reader's today rather than UTC's.
 *
 * Returns undefined rather than a fallback string when there is nothing usable, so
 * callers can omit the clause entirely instead of printing "since Invalid Date".
 * The API's member record carries joinedAt, but it is optional and we do not
 * control whether it arrives.
 *
 * `now` is a parameter so the boundary cases can be tested without freezing the
 * clock; callers pass nothing.
 *
 * A WRAPPER, NOT AN IMPLEMENTATION. The formatting itself is CCPJoined, shared
 * with the Classic and Modern clients so an arrival reads the same in all three —
 * it was written three times, three ways, before it was written once. What stays
 * here is the shape TypeScript callers want: undefined for "nothing to say",
 * where the shared code returns "" because that is the mode 5 idiom.
 */
export const formatJoined = (iso: string | undefined, now?: Date): string | undefined =>
  CCPJoined.format(iso, now) || undefined;
