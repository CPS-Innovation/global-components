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
 */
export const formatJoined = (iso: string | undefined, now: Date = new Date()): string | undefined => {
  if (!iso) {
    return undefined;
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return undefined;
  }
  const hours24 = at.getHours();
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(at.getMinutes()).padStart(2, "0");
  const meridiem = hours24 < 12 ? "am" : "pm";
  const time = `${hours}.${minutes}${meridiem}`;

  // Compared as calendar days, not as an elapsed-hours difference: 11pm and 1am are
  // two hours apart and different days, which is what a reader means by "yesterday".
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysBefore = Math.round((startOfDay(now) - startOfDay(at)) / 86400000);

  if (daysBefore === 0) {
    return time;
  }
  if (daysBefore === 1) {
    return `${time} yesterday`;
  }
  // Anything else — including a timestamp in the future, which should not happen but
  // reads better as a date than as "in -3 days".
  const month = at.toLocaleString("en-GB", { month: "long" });
  return `${time} on ${at.getDate()} ${month} ${at.getFullYear()}`;
};
