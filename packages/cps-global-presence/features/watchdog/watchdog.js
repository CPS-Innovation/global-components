/* features/watchdog/watchdog.js — the Watchdog feature, for both legacy clients.
 *
 * A host supplies two things: which sections are on screen, and how to draw a
 * CCPView. This owns the rest: the sessions, the roster, waiting for the CMS
 * instance, and window.__ccPresence. The platform (platform/platform.js) supplies
 * the reader, the calls and the log, and the launcher (platform/launcher.js) decides
 * when this runs.
 *
 * ONE PASS while running: read the sections ONCE, register them, redraw if the
 * primary section changed. Every redraw between passes (a poll answering, a section
 * dropped) uses the sections from the last pass rather than reading the page again.
 *
 * The banner is about the PRIMARY section's case: the first section the app
 * reports, so the app's detector order is its priority order.
 *
 * TWO PROGRESSIVE GATES, both failing closed (RPLT-246), each defined per
 * environment in LEGACY_UI.gates in the web components' cohort shape (adGroupIds,
 * adHocUserObjectIds, generallyAvailable — see platform/gates.js):
 *   gate 1, CONNECT  the feature's gate: closed means it is not running, so no
 *                    create/poll/heartbeat/leave and no reading of the page
 *   gate 2, SHOW_UI  no stripe unless gate 1 is open AND CASE_PRESENCE_GATE_2_SHOW_UI is
 * Gate 1 without gate 2 is a dark launch: real Watchdog traffic to observe, with
 * nothing on screen; generallyAvailable on gate 1 alone is that for everyone. The
 * legacyClientsWatchdog preview flag opens both (OR, never AND: it can only enrol).
 * The groups and the flag both settle within a few passes of boot, so each pass
 * re-asks, and a gate that closes (a forced whoami losing the groups) leaves every
 * section.
 *
 * ABOVE BOTH, THE ENTRA ROLLOUT. A reader outside it (platform.inRollout) has both
 * gates shut, the preview flag and generallyAvailable included.
 */

var CCPWatchdog = {};

// The LEGACY_UI.gates names the gates ask about (see the header).
CCPWatchdog.GATE_1_CONNECT = "CASE_PRESENCE_GATE_1_CONNECT";
CCPWatchdog.GATE_2_SHOW_UI = "CASE_PRESENCE_GATE_2_SHOW_UI";

/**
 * @param {*} platform  from CCPPlatform.createPlatform, with the launcher's loop
 * @param {{
 *   sections: function(): Array<{id: string, caseId: string}>,
 *   render: function(?{count: number, summary: string, lines: string[]}, string): void,
 *   afterPass?: function(): void,
 *   diagnostics?: Object<string, function(): *>
 * }} o
 *   sections            what is on screen now, primary first; called once per pass
 *   render              draw a view, or hide when given null; the reason is for logging
 *   afterPass           runs at the end of every pass
 *   diagnostics         extra members for window.__ccPresence
 * @returns {{name: string, gate: function(): boolean, observe: function(): void,
 *            pass: function(): void, stop: function(): void,
 *            onNotifications: function(Array, string=): void}}
 */
CCPWatchdog.createFeature = function (platform, o) {
  var logBuffer = platform.logBuffer;
  var log = platform.log;
  var viewer = platform.viewer;
  var named = platform.gates;
  var preview = platform.preview;
  var roster = CCPRoster.createRoster();

  /** @type {Array<{id: string, caseId: string}>} */
  var current = [];
  /** @type {?boolean} */
  var countSelfOverride = null;
  var lastSectionsKey = "";
  var lastPrimaryId = "";
  var waitingLogged = false;
  var troubleNoticed = false;
  // What the gates said last pass, so a change is logged (and redrawn) once.
  var lastGates = "";
  // Whether the CMS instance is known, as of this pass's observe().
  var ready = false;

  function countSelf() {
    if (countSelfOverride !== null) {
      return countSelfOverride;
    }
    return preview ? preview.countSelf() : false;
  }

  // Each gate: the group, or the preview flag. Read fresh every time — both
  // answers can arrive after boot.
  function enrolled() {
    return preview ? preview.legacyClientsWatchdog() : false;
  }

  // The feature's gate. The launcher applies the rollout on top of it.
  function gate() {
    return named.open(CCPWatchdog.GATE_1_CONNECT) || enrolled();
  }

  function connectOpen() {
    return platform.inRollout() && gate();
  }

  function showOpen() {
    return connectOpen() && (named.open(CCPWatchdog.GATE_2_SHOW_UI) || enrolled());
  }

  function gates() {
    return {
      connect: connectOpen(),
      showUi: showOpen(),
      // What LEGACY_UI.gates says on its own: "generallyAvailable", "group",
      // "adHoc", or "" for closed.
      byConfig: {
        connect: named.why(CCPWatchdog.GATE_1_CONNECT),
        showUi: named.why(CCPWatchdog.GATE_2_SHOW_UI)
      },
      byPreview: enrolled(),
      // true, false, or null (unknown); false shuts both gates.
      entraEnabled: viewer.entraEnabled()
    };
  }

  function ids() {
    var out = [];
    var i;
    for (i = 0; i < current.length; i++) {
      out.push(current[i].id);
    }
    return out;
  }

  function primary() {
    return current.length ? current[0] : null;
  }

  // An unanswered whoami means an empty viewer address, so nobody is filtered:
  // one person too many, never a colleague hidden.
  function view() {
    var p = primary();
    if (!p) {
      return null;
    }
    return CCPView.build({
      members: roster.members(ids(), p.caseId),
      viewerEmail: viewer.email(),
      countSelf: countSelf()
    });
  }

  // The reason is logged only when what the reader can see changes (CCPLog.ui).
  function redraw(reason) {
    var p = primary();
    var v = view();
    if (!showOpen()) {
      o.render(null, reason);
      logBuffer.ui(false, 0, "gate 2 (show UI) closed (" + reason + ")");
      return;
    }
    if (v && v.count) {
      o.render(v, reason);
      logBuffer.ui(true, v.count, reason);
    } else {
      o.render(null, reason);
      logBuffer.ui(false, 0, (p ? "nobody else on case " + p.caseId : "no section on screen") + " (" + reason + ")");
    }
  }

  function logRosterChanges() {
    var said = CCPLog.describeChanges(roster.takeChanges());
    if (said) {
      log("roster", said);
    }
  }

  function onNotifications(data, sectionId) {
    if (roster.apply(data, sectionId)) {
      logRosterChanges();
      redraw("roster changed");
    } else if (logBuffer.verbose()) {
      log("no change");
    }
  }

  function onSectionDropped(sectionId) {
    if (roster.forget(sectionId)) {
      logRosterChanges();
      redraw("section dropped " + sectionId);
    }
  }

  // A refused credential is worth asking the token's age (at most once a minute).
  // A failed call hides the banner rather than leave a roster on screen we can no
  // longer vouch for, and says so on the console once.
  function onTrouble(sectionId, reason, op) {
    if (/\b40[13]\b/.test(reason)) {
      viewer.recheck(reason);
    }
    o.render(null, "trouble");
    logBuffer.ui(false, 0, "trouble " + (op ? op + " " : "") + (sectionId ? sectionId + " " : "") + reason);
    // A dark-launch reader (gate 1 open, gate 2 closed) is not meant to know
    // presence exists, so the console line is for gate 2 readers only.
    if (troubleNoticed || !showOpen()) {
      return;
    }
    troubleNoticed = true;
    try {
      if (window.console && window.console.log) {
        window.console.log("There was an error connecting to The Watchdog: " + reason + " (history: window.__ccPresence.dump())");
      }
    } catch (e) { }
  }

  // Polls return deltas, so on a quiet case nothing changes after an outage: the
  // banner comes back when the calls do, not when the roster next changes.
  function onRecovered(sectionId, downMs) {
    if (sessions.anyTroubled()) {
      log("banner stays down: another section is still not answering");
      return;
    }
    redraw("calls answering again after " + downMs + "ms");
  }

  var sessions = CCPSessions.createSessions({
    call: platform.call,
    appName: platform.appName,
    tickMs: CCPSections.HEARTBEAT_MS,
    log: log,
    verbose: logBuffer.verbose,
    onNotifications: onNotifications,
    onSectionDropped: onSectionDropped,
    onTrouble: onTrouble,
    onRecovered: onRecovered
  });

  // The CIN suffix arrives with whoami, and a section named without it joins a
  // room nobody is in. adopt() is set-once, so offering it every pass is free.
  function environmentReady() {
    if (viewer.cmsEnv()) {
      CCPEnvironment.adopt(viewer.cmsEnv());
    }
    if (CCPEnvironment.known()) {
      return true;
    }
    if (!waitingLogged) {
      waitingLogged = true;
      log("waiting for the CMS environment before registering anything");
    }
    return false;
  }

  // Logged, and redrawn for, only when the answer changes: the groups and the
  // preview flag each arrive a pass or two after boot.
  function logGates() {
    var g = gates();
    var key = (g.connect ? "1" : "0") + (g.showUi ? "1" : "0") + String(g.entraEnabled);
    if (key === lastGates) {
      return;
    }
    var first = lastGates === "";
    lastGates = key;
    log(
      "gates",
      "connect=" + (g.connect ? "open" : "closed"),
      "showUi=" + (g.showUi ? "open" : "closed"),
      "(config: connect=" + (g.byConfig.connect || "closed") +
        " showUi=" + (g.byConfig.showUi || "closed") +
        "; preview legacyClientsWatchdog=" + g.byPreview +
        "; entraEnabled=" + (g.entraEnabled === null ? "(unknown)" : g.entraEnabled) + ")"
    );
    if (!first) {
      redraw("gates changed");
    }
  }

  // Every pass, running or not: the console reports the suffix and the gates either way.
  function observe() {
    try {
      ready = environmentReady();
    } catch (e1) {
      ready = false;
    }
    try {
      logGates();
    } catch (e2) { }
  }

  // Each step guarded on its own: the page is someone else's, and a throw in one
  // must not stop the others.
  function pass() {
    var key, p, id;
    try {
      current = o.sections() || [];
    } catch (e1) {
      current = [];
    }
    key = ids().join("|");
    if (key !== lastSectionsKey) {
      lastSectionsKey = key;
      log("sections", key || "(none)");
    }
    try {
      if (ready) {
        sessions.setDesired(ids());
      }
    } catch (e2) { }
    try {
      p = primary();
      id = p ? p.id : "";
      if (id !== lastPrimaryId) {
        lastPrimaryId = id;
        redraw("section changed to " + (id || "(none)"));
      }
      if (o.afterPass) {
        o.afterPass();
      }
    } catch (e3) { }
  }

  // Leaves every section (best effort: the server would otherwise wait out the
  // TTL) and hides the banner. The next pass after the gate reopens picks up again.
  function stop() {
    try {
      sessions.stop();
    } catch (e) { }
    roster.clear();
    current = [];
    lastPrimaryId = "";
    lastSectionsKey = "";
    try {
      o.render(null, "stopped");
    } catch (e2) { }
  }

  platform.onPreviewChange(function () {
    redraw("preview flags arrived");
  });

  var handle = {
    status: function () {
      return { appName: platform.appName, base: platform.base, cin: CCPEnvironment.CIN, sections: current, sessions: sessions.stats() };
    },
    sections: function () {
      return current;
    },
    sessions: function () {
      return sessions.stats();
    },
    // What the banner says, in full. Console only: the log masks addresses.
    roster: function () {
      var v = view();
      return v ? v.lines : [];
    },
    rosterBySection: function () {
      return roster.sections();
    },
    whoami: function () {
      var who = platform.whoami();
      // The suffix adopted; null means nothing has registered.
      who.cin = CCPEnvironment.CIN;
      return who;
    },
    // whoami() is a cache of the last answer; this asks again.
    refreshWhoami: function () {
      viewer.refresh(true);
    },
    // Whether each presence gate is open, and why.
    gates: gates,
    // The flags in the IE-mode cookie jar, and whether the reader is counted.
    preview: function () {
      return { known: preview.known(), flags: preview.flags(), countSelf: countSelf() };
    },
    refreshPreview: function () {
      preview.refresh(true);
    },
    // true/false overrides the caseLockingCountSelf flag for this page; null follows it.
    setCountSelf: function (on) {
      countSelfOverride = on === null || on === undefined ? null : !!on;
      log("countSelf", countSelfOverride === null ? "from preview" : countSelfOverride ? "on" : "off");
      redraw("countSelf override");
      return countSelf();
    },
    // The history since boot, as one copyable string: IEChooser cannot attach
    // before boot, so this is how to read what already happened.
    dump: function () {
      return logBuffer.dump();
    },
    messages: logBuffer.messages,
    setConsole: function (on) {
      return logBuffer.setEcho(on);
    },
    // Log every heartbeat and every failed call, not just the first of a run.
    setVerbose: function (on) {
      return logBuffer.setVerbose(on);
    },
    reconcile: platform.loop.reconcile,
    start: platform.loop.start,
    stop: platform.loop.stop
  };
  var name;
  if (o.diagnostics) {
    for (name in o.diagnostics) {
      if (o.diagnostics.hasOwnProperty(name)) {
        /** @type {*} */ (handle)[name] = o.diagnostics[name];
      }
    }
  }
  /** @type {*} */ (window).__ccPresence = handle;

  return {
    name: "watchdog",
    gate: gate,
    observe: observe,
    pass: pass,
    stop: stop,
    onNotifications: onNotifications
  };
};
