/* legacy/log.js — WHAT HAPPENED, KEPT FOR WHOEVER ASKS LATER.
 * Shared between Classic and Modern/DCF. MODE 5 FLOOR.
 *
 * WHY A RING BUFFER. The only console in the CMS estate is IEChooser's, and it
 * cannot be attached before the page boots. Presence trouble is intermittent: the
 * stripe or banner is there, then it is not, then it is back. By the time someone
 * opens a console the interesting part has already happened. So every line is
 * written to a buffer FIRST, from the moment the client loads, and dump() hands
 * the whole history back as one copyable string.
 *
 * ECHO IS A PER-CLIENT CHOICE. Modern has always written to the console. Classic
 * has never done so routinely, because an unexpected console call in someone
 * else's document-mode-5 application is a real risk. Classic therefore records
 * silently and echoes only after someone runs __ccPresence.setConsole(true), while
 * Modern echoes from the start. Both keep the same buffer, so the same question
 * can be asked of either.
 *
 * ONE STRING PER LINE, ON THE CONSOLE AND IN THE BUFFER. IEChooser renders
 * objects badly, and console.log.apply is not dependable on a mode 5 host object,
 * so arguments are joined here rather than passed through.
 *
 * ui() IS THE LINE THAT EXPLAINS "SOMETIMES ON, SOMETIMES OFF". It records every
 * time the presence UI appears or disappears, and why. It is silent when nothing
 * visible changes, so it costs nothing on a quiet pass.
 */

var CCPLog = {};

/** Lines kept. About fifteen minutes of a troubled session; a lot longer of a quiet one. */
CCPLog.LIMIT = 300;

/**
 * An address, shortened before it goes into a buffer that people paste into
 * tickets: "ann.smith@cps.gov.uk" becomes "an***@cps.gov.uk". The domain is kept
 * because it says which estate someone is in, and two people seldom share the
 * first two letters on one case.
 *
 * @param {string|undefined} email
 * @returns {string}
 */
CCPLog.mask = function (email) {
  var text = String(email || "");
  var at = text.indexOf("@");
  var local = at === -1 ? text : text.substring(0, at);
  var domain = at === -1 ? "" : text.substring(at);
  if (!local) {
    return text;
  }
  return local.substring(0, local.length > 2 ? 2 : 1) + "***" + domain;
};

/**
 * A list of addresses, masked and comma-joined; "" when empty.
 * @param {string[]} emails
 * @returns {string}
 */
CCPLog.maskAll = function (emails) {
  var out = [];
  var i;
  for (i = 0; i < emails.length; i++) {
    out.push(CCPLog.mask(emails[i]));
  }
  return out.join(",");
};

/**
 * A roster's arrivals and departures as one log phrase: "+an***@cps.gov.uk
 * -bo***@cps.gov.uk". "" when nobody came or went, so a caller can skip the line.
 *
 * @param {{joined: string[], left: string[]}} changes from CCPRoster's takeChanges()
 * @returns {string}
 */
CCPLog.describeChanges = function (changes) {
  var parts = [];
  if (changes.joined.length) {
    parts.push("+" + CCPLog.maskAll(changes.joined));
  }
  if (changes.left.length) {
    parts.push("-" + CCPLog.maskAll(changes.left));
  }
  return parts.join(" ");
};

/**
 * @param {{prefix: string, echo: boolean, limit?: number}} options
 * @returns {{log: function(...*): void, dump: function(): string,
 *            messages: Array<{at: string, line: string}>,
 *            setEcho: function(boolean): boolean, echoing: function(): boolean,
 *            setVerbose: function(boolean): boolean, verbose: function(): boolean,
 *            ui: function(boolean, number, string): void,
 *            since: function(): string}}
 */
CCPLog.createLog = function (options) {
  /** @type {Array<{at: string, line: string}>} */
  var messages = [];
  var limit = options.limit ? options.limit : CCPLog.LIMIT;
  var echo = !!options.echo;
  var verbose = false;
  var startedAt = new Date().getTime();
  var uiShown = false;
  var uiCount = -1;

  // Milliseconds since the client loaded. Printed on every line, because "how long
  // after boot" is what separates a slow first whoami from something that went
  // wrong an hour in.
  function since() {
    return "+" + (new Date().getTime() - startedAt) + "ms";
  }

  function log() {
    var parts = [];
    var i, line;
    for (i = 0; i < arguments.length; i++) {
      parts.push(String(arguments[i]));
    }
    line = parts.join(" ");
    messages.push({ at: CCPUtil.stamp(), line: since() + " " + line });
    if (messages.length > limit) {
      messages.shift();
    }
    if (!echo) {
      return;
    }
    try {
      if (window.console && window.console.log) {
        window.console.log(options.prefix + " " + line);
      }
    } catch (e) {
      // a host app with a hostile console must never break presence
    }
  }

  // Logged only when what the reader can SEE changes: on to off, off to on, or
  // a different number of people. A redraw that changes nothing visible says
  // nothing.
  function ui(shown, count, reason) {
    if (shown === uiShown && (!shown || count === uiCount)) {
      return;
    }
    uiShown = shown;
    uiCount = shown ? count : -1;
    if (shown) {
      log("UI SHOW", count + (count === 1 ? " person" : " people"), "reason=" + reason);
    } else {
      log("UI HIDE", "reason=" + reason);
    }
  }

  return {
    log: log,
    ui: ui,
    since: since,
    messages: messages,
    // One string, oldest first: the form that survives being copied out of
    // IEChooser and pasted into a ticket.
    dump: function () {
      var out = "";
      var i;
      for (i = 0; i < messages.length; i++) {
        out = out + messages[i].at + "  " + messages[i].line + "\n";
      }
      return out;
    },
    setEcho: function (on) {
      echo = !!on;
      log("console", echo ? "on" : "off");
      return echo;
    },
    echoing: function () {
      return echo;
    },
    setVerbose: function (on) {
      verbose = !!on;
      log("verbose", verbose ? "on" : "off");
      return verbose;
    },
    verbose: function () {
      return verbose;
    }
  };
};
