var CCPRoster = {};

/* common/presence-roster.js — snapshot reconciliation + roster. SHARED, MODE 5 FLOOR.
 *
 * The one piece of logic worth never writing twice: given the notifications the
 * presence API returns — over JSONP for the legacy clients, over SignalR for the
 * current apps — work out who is present, once per person, across sections.
 *
 * Wire shape (identical on both transports):
 *   notifications[] -> { payload: { snapshots: [ ... ] } }
 *   snapshot        -> { section: {caseId, kind, subjectId}, version, members[] }
 *   member          -> { userEmail, sourceApplication, joinedAt }
 *
 * Poll returns DELTAS with no ordering guarantee, so a snapshot replaces a
 * section's cached roster only when its version is strictly NEWER. An empty
 * members array at a newer version correctly clears that section.
 */

/**
 * A roster: apply the API's notifications, ask who is present.
 * @returns {{
 *   apply: function(CCPNotification[]|null|undefined): boolean,
 *   people: function(): CCPPerson[],
 *   describe: function(): string,
 *   sections: function(): Object,
 *   forget: function(string): boolean,
 *   clear: function(): void
 * }}
 */
CCPRoster.createRoster = function () {
  var sections = {};

  /**
   * @param {CCPMember[]|null|undefined} members
   * @returns {{userEmail: string, sourceApplication: string, joinedAt: string}[]}
   */
  function normaliseMembers(members) {
    var out = [];
    var i, m;
    if (!members || typeof members.length !== "number") {
      return out;
    }
    for (i = 0; i < members.length; i++) {
      m = members[i];
      if (m && m.userEmail) {
        out.push({
          userEmail: m.userEmail,
          sourceApplication: m.sourceApplication ? m.sourceApplication : "",
          joinedAt: m.joinedAt ? m.joinedAt : ""
        });
      }
    }
    return out;
  }

  return {
    // Apply one poll response (or one SignalR notification, wrapped in an array).
    // Returns true only if something actually changed, so callers redraw and log
    // on real news rather than on every tick.
    apply: function (notifications) {
      var changed = false;
      var n, notif, snaps, s, snap, key, version, current;

      if (!notifications || typeof notifications.length !== "number") {
        return false;
      }

      for (n = 0; n < notifications.length; n++) {
        notif = notifications[n];
        if (!notif || !notif.payload) {
          continue;
        }
        snaps = notif.payload.snapshots;
        if (!snaps || typeof snaps.length !== "number") {
          continue;
        }
        for (s = 0; s < snaps.length; s++) {
          snap = snaps[s];
          if (!snap) {
            continue;
          }
          key = CCPSections.sectionKey(snap.section);
          if (!key) {
            continue;
          }
          version = snap.version;
          if (typeof version !== "number") {
            // A missing or non-numeric version cannot be ordered. String() keeps
            // parseInt honest about undefined, and the resulting NaN makes every
            // comparison below false — so an unversioned snapshot is always
            // accepted, which is the best available behaviour when the server
            // gives us nothing to order by.
            version = parseInt(String(version), 10);
          }
          current = sections[key];
          if (current && typeof current.version === "number" && !isNaN(version) && version <= current.version) {
            continue; // stale / out-of-order — keep the newer cached roster
          }
          sections[key] = {
            caseId: snap.section && snap.section.caseId !== undefined && snap.section.caseId !== null ? String(snap.section.caseId) : "",
            kind: snap.section && snap.section.kind !== undefined && snap.section.kind !== null ? String(snap.section.kind) : "",
            subjectId: snap.section && snap.section.subjectId !== undefined && snap.section.subjectId !== null ? String(snap.section.subjectId) : "",
            version: version,
            members: normaliseMembers(snap.members)
          };
          changed = true;
        }
      }
      return changed;
    },

    // ONE PERSON, ONE ENTRY. Someone can be in several sections at once — on the
    // case AND editing a witness within it — and a UI must say that once, listing
    // their regions, rather than showing them twice.
    people: function () {
      var byUser = {};
      var order = [];
      var out = [];
      var key, entry, j, member, id, i;

      for (key in sections) {
        if (!sections.hasOwnProperty(key)) {
          continue;
        }
        entry = sections[key];
        for (j = 0; j < entry.members.length; j++) {
          member = entry.members[j];
          id = String(member.userEmail ? member.userEmail : "").toLowerCase();
          if (!id) {
            continue;
          }
          if (!byUser.hasOwnProperty(id)) {
            byUser[id] = { userEmail: member.userEmail, regions: [], apps: [] };
            order.push(id);
          }
          byUser[id].regions.push(entry.kind + (entry.subjectId ? ":" + entry.subjectId : ""));
          if (member.sourceApplication && CCPSections.indexOfString(byUser[id].apps, member.sourceApplication) === -1) {
            byUser[id].apps.push(member.sourceApplication);
          }
        }
      }

      for (i = 0; i < order.length; i++) {
        out.push(byUser[order[i]]);
      }
      return out;
    },

    describe: function () {
      var people = this.people();
      var parts = [];
      var i, person;
      if (!people.length) {
        return "(nobody)";
      }
      for (i = 0; i < people.length; i++) {
        person = people[i];
        parts.push(person.userEmail + " [" + person.regions.join(",") + "]" + (person.apps.length ? " via " + person.apps.join(",") : ""));
      }
      return parts.join(" | ");
    },

    sections: function () {
      return sections;
    },

    // Forget ONE section — its session has gone, so its roster is no longer
    // evidence of anything. Distinct from clear(): the other sections a user is
    // in are still live and their rosters still true.
    // Rebuilt rather than deleted: `delete` is barred at the mode 5 floor (it
    // cannot remove a window expando there, and the checker cannot tell a plain
    // object from a window). A roster holds a handful of sections, so copying is
    // free.
    forget: function (sectionId) {
      var next = {};
      var key;
      var found = false;
      for (key in sections) {
        if (!sections.hasOwnProperty(key)) {
          continue;
        }
        if (key === sectionId) {
          found = true;
        } else {
          next[key] = sections[key];
        }
      }
      sections = next;
      return found;
    },

    clear: function () {
      sections = {};
    }
  };
};
