/* core/util.js — what document mode 5 lacks, written once.
 *
 * Every file in core/ and legacy/shared/ runs in CMS Classic (document mode 5): no
 * Array.prototype.indexOf, no String.prototype.endsWith, no toISOString.
 * check-syntax.js es3 denies them, so the replacements live here.
 */

var CCPUtil = {};

/**
 * @param {Array<*>} list
 * @param {*} value
 * @returns {number} the index, or -1
 */
CCPUtil.indexOf = function (list, value) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] === value) {
      return i;
    }
  }
  return -1;
};

/**
 * The first item whose `key` property equals `value`, or null.
 * @template T
 * @param {T[]} list
 * @param {string} key
 * @param {*} value
 * @returns {T|null}
 */
CCPUtil.find = function (list, key, value) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (/** @type {*} */ (list[i])[key] === value) {
      return list[i];
    }
  }
  return null;
};

/**
 * @param {string} text
 * @param {string} suffix
 * @returns {boolean}
 */
CCPUtil.hasSuffix = function (text, suffix) {
  if (suffix.length > text.length) {
    return false;
  }
  return text.substring(text.length - suffix.length) === suffix;
};

/**
 * Left-pad with zeros to `width` digits.
 * @param {number} n
 * @param {number} width
 * @returns {string}
 */
CCPUtil.pad = function (n, width) {
  var s = String(n);
  while (s.length < width) {
    s = "0" + s;
  }
  return s;
};

/**
 * An ISO-8601 UTC timestamp with milliseconds: "2026-11-04T09:30:00.123Z".
 * @param {Date} [date] defaults to now
 * @returns {string}
 */
CCPUtil.stamp = function (date) {
  var d = date || new Date();
  var pad = CCPUtil.pad;
  return d.getUTCFullYear() +
    "-" + pad(d.getUTCMonth() + 1, 2) +
    "-" + pad(d.getUTCDate(), 2) +
    "T" + pad(d.getUTCHours(), 2) +
    ":" + pad(d.getUTCMinutes(), 2) +
    ":" + pad(d.getUTCSeconds(), 2) +
    "." + pad(d.getUTCMilliseconds(), 3) +
    "Z";
};
