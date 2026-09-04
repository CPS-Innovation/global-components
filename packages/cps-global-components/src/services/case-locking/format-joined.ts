/**
 * "3.38pm on 21 September 2026" — the format the UCD prototype uses.
 *
 * GDS style: no leading zero on the hour, a full stop rather than a colon,
 * lower-case am/pm, and the month spelled out. Rendered in the reader's local
 * time, which is what "since" means to them.
 *
 * Returns undefined rather than a fallback string when there is nothing usable,
 * so callers can omit the clause entirely instead of printing "since Invalid
 * Date". The API's member record carries joinedAt, but it is optional and we do
 * not control whether it arrives.
 */
export const formatJoined = (iso: string | undefined): string | undefined => {
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
  const month = at.toLocaleString("en-GB", { month: "long" });
  return `${hours}.${minutes}${meridiem} on ${at.getDate()} ${month} ${at.getFullYear()}`;
};
