/* common/presence-locator.js — "which sections is this user in?". SHARED, MODE 5 FLOOR.
 *
 * ONE JOB: identify the sections currently active, and nothing else. No sessions,
 * no network, no UI. Adding a newly-supported section should mean adding one
 * detector to a list and nothing more, which is the whole reason this exists as a
 * module rather than as a function buried in each client.
 *
 * A DETECTOR is `{ kind, detect: function (scope) -> section | section[] | null }`.
 * `scope` is whatever the host app hands over — Classic passes a frame's window,
 * Modern passes a URL string — because how you FIND a section is irreducibly
 * app-specific, while what a section IS is not.
 *
 * PLURAL ON PURPOSE. A user can be in several sections at once: on the case AND
 * editing a witness within it. The roster is keyed by section and has always
 * coped; it was the locators that returned only the first match and silently
 * dropped the rest.
 *
 * `hint` travels with a section untouched by shared code. Classic uses it to
 * remember which frame a section was found in, so its popup knows where to
 * anchor; Modern uses it for diagnostics. Anything app-specific goes there rather
 * than widening the section shape for everyone.
 */

var CCPLocator = {};

/**
 * Normalise the parts of a section into the shape everything downstream expects.
 * Returns null when there is no identifiable section, so a detector can simply
 * `return CCPLocator.section(...)` and let a missing caseId mean "not here".
 *
 * @param {string|number|null|undefined} caseId
 * @param {string|null|undefined} kind
 * @param {string|number|null=} subjectId
 * @param {*=} hint app-specific payload, passed through untouched
 * @returns {{id: string, caseId: string, kind: string, subjectId: string, hint: *}|null}
 */
CCPLocator.section = function (caseId, kind, subjectId, hint) {
  var id = CCPSections.sectionId(caseId, kind, subjectId);
  if (!id) {
    return null;
  }
  return {
    id: id,
    caseId: String(caseId),
    kind: String(kind),
    subjectId: subjectId !== undefined && subjectId !== null ? String(subjectId) : "",
    hint: hint
  };
};

/**
 * A detector driven entirely by the page URL — the whole story for Modern and DCF,
 * where the address IS the context: on /dcf/ you are reviewing a case, and in the
 * viewer you are on one.
 *
 * @param {{kind: string, pattern: RegExp, caseIdGroup?: number, subjectIdGroup?: number,
 *          hint?: *}} spec
 * @returns {{kind: string, detect: function(*): Object|null}}
 */
CCPLocator.urlDetector = function (spec) {
  var caseIdGroup = spec.caseIdGroup ? spec.caseIdGroup : 1;
  return {
    kind: spec.kind,
    detect: function (scope) {
      var url = typeof scope === "string" ? scope : "";
      if (!url) {
        return null;
      }
      var match = spec.pattern.exec(url);
      if (!match) {
        return null;
      }
      var subjectId = spec.subjectIdGroup ? match[spec.subjectIdGroup] : null;
      return CCPLocator.section(match[caseIdGroup], spec.kind, subjectId, spec.hint);
    }
  };
};

/**
 * Build a locator over a list of detectors.
 *
 * @param {{kind: string, detect: function(*): (Object|Object[]|null)}[]} detectors
 * @returns {{list: function(*): Object[], ids: function(*): string[]}}
 */
CCPLocator.createLocator = function (detectors) {
  // A detector may legitimately return one section, several, or nothing; and two
  // detectors can name the same section (the Defs & Charges frame and the case
  // review frame both sitting on one case). Flatten, and keep first-seen order —
  // callers use position for "the section this page is mostly about".
  function collect(out, seen, found) {
    var i, section;
    if (!found) {
      return;
    }
    if (typeof found.length === "number") {
      for (i = 0; i < found.length; i++) {
        collect(out, seen, found[i]);
      }
      return;
    }
    section = found;
    if (!section.id || seen.hasOwnProperty(section.id)) {
      return;
    }
    seen[section.id] = true;
    out.push(section);
  }

  return {
    /**
     * Every section active in `scope`, in detector order, deduplicated by id.
     * A throwing detector is skipped rather than allowed to take the pass down —
     * Classic reads live CMS frame state, where anything can be anything.
     */
    list: function (scope) {
      var out = [];
      var seen = {};
      var i, found;
      for (i = 0; i < detectors.length; i++) {
        found = null;
        try {
          found = detectors[i].detect(scope);
        } catch (e) {
          found = null;
        }
        collect(out, seen, found);
      }
      return out;
    },

    /** The same, reduced to section ids — what the session layer actually wants. */
    ids: function (scope) {
      var sections = this.list(scope);
      var out = [];
      var i;
      for (i = 0; i < sections.length; i++) {
        out.push(sections[i].id);
      }
      return out;
    }
  };
};
