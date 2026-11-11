/* core/roster.js — who is present, per section, from the API's notifications.
 *
 * Wire shape (the same over JSONP and SignalR):
 *   notifications[] -> { payload: { snapshots: [ ... ] } }
 *   snapshot        -> { section: {caseId, kind, subjectId}, version, members[] }
 *   member          -> { userEmail, sourceApplication, joinedAt }
 *
 * Snapshots arrive as unordered deltas, so one replaces a section's roster only
 * when its version is strictly newer. An empty members list at a newer version
 * clears the section.
 *
 * The hub sends a session every section that CONFLICTS with it, not just its own
 * — someone in the case review while we are on the case. So each entry remembers
 * which of our sections delivered it (`via`), and forgetting one of our sections
 * also drops whatever only it delivered. Without that, a conflict roster outlives
 * the session that reported it, for the life of the page.
 *
 * `delete` is barred at the mode 5 floor, so maps are rebuilt rather than edited.
 * Keys are prefixed "s" where they are section ids, so no id can collide with an
 * Object.prototype name.
 */

var CCPRoster = {};

/**
 * @typedef {{caseId: string, kind: string, subjectId: string, version: number,
 *            members: {userEmail: string, sourceApplication: string, joinedAt: string}[],
 *            via: Object<string, boolean>}} CCPRosterEntry
 */

/**
 * @param {CCPMember[]|null|undefined} members
 * @returns {{userEmail: string, sourceApplication: string, joinedAt: string}[]}
 */
CCPRoster.normaliseMembers = function (members) {
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
};

/**
 * @returns {{
 *   apply: function((CCPNotification[]|null|undefined), string=): boolean,
 *   sections: function(): Object<string, CCPRosterEntry>,
 *   members: function((string[]|undefined), string=): CCPRosterMember[],
 *   forget: function(string): boolean,
 *   rewind: function(): void,
 *   clear: function(): void,
 *   takeChanges: function(): {joined: string[], left: string[]}
 * }}
 */
CCPRoster.createRoster = function () {
  /** @type {Object<string, CCPRosterEntry>} */
  var sections = {};
  // Who was present the last time takeChanges() was asked, by lower-cased address.
  var lastSeen = {};

  return {
    // Apply notifications, delivered by our section `via` (optional: SignalR has
    // one roster per connection and needs no attribution). True only when a
    // roster actually changed, so callers redraw on news, not on every poll.
    apply: function (notifications, via) {
      var changed = false;
      var n, notif, snaps, s, snap, key, version, current;

      if (!notifications || typeof notifications.length !== "number") {
        return false;
      }
      for (n = 0; n < notifications.length; n++) {
        notif = notifications[n];
        snaps = notif && notif.payload ? notif.payload.snapshots : null;
        if (!snaps || typeof snaps.length !== "number") {
          continue;
        }
        for (s = 0; s < snaps.length; s++) {
          snap = snaps[s];
          key = snap ? CCPSections.sectionKey(snap.section) : "";
          if (!key) {
            continue;
          }
          current = sections[key];
          if (current && via) {
            current.via["s" + via] = true;
          }
          // A missing version cannot be ordered: parseInt gives NaN, every
          // comparison is false, and the snapshot is accepted.
          version = typeof snap.version === "number" ? snap.version : parseInt(String(snap.version), 10);
          if (current && !isNaN(version) && version <= current.version) {
            continue;
          }
          sections[key] = {
            caseId: String(snap.section && snap.section.caseId != null ? snap.section.caseId : ""),
            kind: String(snap.section && snap.section.kind != null ? snap.section.kind : ""),
            subjectId: String(snap.section && snap.section.subjectId != null ? snap.section.subjectId : ""),
            version: version,
            members: CCPRoster.normaliseMembers(snap.members),
            via: current ? current.via : {}
          };
          if (via) {
            sections[key].via["s" + via] = true;
          }
          changed = true;
        }
      }
      return changed;
    },

    sections: function () {
      return sections;
    },

    // Every member record, flattened, in the shape CCPView takes. Each record's
    // section is marked isCurrent when it is one of ours (ourSectionIds), and its
    // kind loses the CIN suffix, which the naming tables do not know. caseId, when
    // given, keeps only that case.
    members: function (ourSectionIds, caseId) {
      var out = [];
      var mine = {};
      var ours = ourSectionIds || [];
      var key, entry, i, j;
      for (i = 0; i < ours.length; i++) {
        mine["s" + ours[i]] = true;
      }
      for (key in sections) {
        if (!sections.hasOwnProperty(key)) {
          continue;
        }
        entry = sections[key];
        if (caseId && entry.caseId !== caseId) {
          continue;
        }
        for (j = 0; j < entry.members.length; j++) {
          out.push({
            userEmail: entry.members[j].userEmail,
            sourceApplication: entry.members[j].sourceApplication,
            joinedAt: entry.members[j].joinedAt,
            sections: [{ kind: CCPEnvironment.baseKind(entry.kind), isCurrent: mine.hasOwnProperty("s" + key) }]
          });
        }
      }
      return out;
    },

    // Our section `sectionId` has gone (left, or evicted). Drop its own roster, and
    // every conflict roster it alone delivered. True when anything was dropped.
    forget: function (sectionId) {
      /** @type {Object<string, CCPRosterEntry>} */
      var next = {};
      var dropped = false;
      var key, entry, via, k, others;
      for (key in sections) {
        if (!sections.hasOwnProperty(key)) {
          continue;
        }
        entry = sections[key];
        if (key === sectionId) {
          dropped = true;
          continue;
        }
        via = {};
        others = false;
        for (k in entry.via) {
          if (entry.via.hasOwnProperty(k) && k !== "s" + sectionId) {
            via[k] = true;
            others = true;
          }
        }
        if (entry.via.hasOwnProperty("s" + sectionId) && !others) {
          dropped = true;
          continue;
        }
        entry.via = via;
        next[key] = entry;
      }
      sections = next;
      return dropped;
    },

    // A new session (a reconnect, or a rejoin after eviction) may count versions
    // afresh, so the next snapshot of every section is taken whatever its number.
    // The members stay until it arrives, so the banner does not blink.
    rewind: function () {
      var key;
      for (key in sections) {
        if (sections.hasOwnProperty(key)) {
          sections[key].version = NaN;
        }
      }
    },

    clear: function () {
      sections = {};
    },

    // Who arrived and who left since the last call, across every section held:
    // the log's account of what made a banner appear or vanish.
    takeChanges: function () {
      var now = {};
      var joined = [];
      var left = [];
      var key, entry, j, id;
      for (key in sections) {
        if (!sections.hasOwnProperty(key)) {
          continue;
        }
        entry = sections[key];
        for (j = 0; j < entry.members.length; j++) {
          id = String(entry.members[j].userEmail || "").toLowerCase();
          if (id && !now.hasOwnProperty(id)) {
            now[id] = true;
            if (!lastSeen.hasOwnProperty(id)) {
              joined.push(id);
            }
          }
        }
      }
      for (id in lastSeen) {
        if (lastSeen.hasOwnProperty(id) && !now.hasOwnProperty(id)) {
          left.push(id);
        }
      }
      lastSeen = now;
      return { joined: joined, left: left };
    }
  };
};
