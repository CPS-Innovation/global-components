/* legacy/shared/viewer.js — WHO IS READING THIS PAGE.
 * Shared between Classic and Modern/DCF. MODE 5 FLOOR.
 *
 * The legacy clients have no idea who the user is. The presence token is an
 * HttpOnly cookie scoped to the proxy, so the page cannot read it, and nothing
 * else on a CMS page carries the address the presence API reports people under.
 * That is why every roster included the reader: not a bug in the rendering, an
 * absence of the fact.
 *
 * The whoami op closes it. It is the one JSONP op the proxy answers itself rather
 * than forwarding — it decodes the cookie it is already sending as a bearer token
 * and returns the claim, never the token.
 *
 * ASKED ONCE, AND CHEAPLY. The answer cannot change without a new page load, so
 * this caches it and refresh() is a no-op once known. A failed attempt leaves the
 * viewer unknown and the next refresh() tries again — the reconcile timer is
 * already calling it, so a whoami that loses a race with the cookie recovers on
 * the next tick instead of leaving self-filtering off for the session.
 *
 * UNKNOWN MEANS FILTER NOBODY. See CCPPeople.others: showing one person too many
 * beats hiding everyone, so nothing here ever guesses at an identity.
 *
 * IT ALSO CARRIES cmsEnv — which CMS environment this session belongs to, read
 * by the adapter from the Cms-Session-Hint cookie. SINCE 2026-11-04 THE CIN
 * SUFFIX COMES FROM IT, so this is now on the critical path: no registration
 * happens until it has arrived (see CCPEnvironment, and the guards in each
 * main.js). That cost nothing in the end — the observation loop was already
 * re-asserting what it wants every pass, so "not yet" simply means the next
 * pass, and no callback restructure was needed to defer the first create.
 *
 * cmsEnvWhy says which of the empties an empty cmsEnv is: nobody wrote the hint,
 * it is corrupt, the writer could not fill it, or it carried no CMS domain. It
 * drives nothing and exists to be read off a console when presence does not
 * start, because all four look the same from here and want different people.
 *
 * AND tokenAge / tokenExpiresIn — how old the presence token is and how long it
 * has left, both decoded by the adapter from the cookie it holds. Carried for the
 * same reason as cmsEnvWhy: they drive nothing here, and they are the only way to
 * see from a client whether the auth replay (classic/auth.js) is achieving
 * anything. The token is in an HttpOnly cookie, so no script can read it, and the
 * auth iframe cannot report back; this is the answer coming the other way, from
 * the server.
 *
 * READ tokenAge, NOT tokenExpiresIn, to answer "did the replay work". AAD's token
 * lifetime varies — 83 minutes and 62 minutes were measured from this same flow —
 * so a successful replay can leave LESS time remaining than the token it
 * replaced, and a falling expiry is consistent with both success and failure. Age
 * resets to near zero whenever a new token is written and climbs from there, so an
 * age that only ever grows is a replay that is failing silently.
 *
 * AND claimKeys — the claim NAMES on that token, for the same reason again: a
 * question that can only be answered server-side, because the token is in an
 * HttpOnly cookie. Names only, never values. Nothing reads it; it is here so
 * "does our token carry claim X" can be answered off a console in a live session
 * instead of by running the auth flow by hand and decoding a bearer token.
 *
 * AND groups — the reader's Entra group IDs, the one VALUE here besides the
 * identity. The app registration emits only groups ASSIGNED to the app that the
 * reader is a MEMBER of, so the list is short and of our choosing. It is what lets
 * these clients gate a feature on group membership the way the web components gate
 * on a cohort's adGroupIds: inGroup(id) is the question to ask. An empty list means
 * "in none of them", whatever the reason — no token yet, a token without the claim,
 * an older adapter — so a gate built on it fails closed.
 */

var CCPViewer = {};

/**
 * How many answered whoami calls to spend waiting for an identity or environment
 * we did not get first time. Either can lose a race with the cookie, so the next
 * pass asks again; but not forever, or a token without them would mean a whoami
 * every pass for the life of the tab. Ten passes is half a minute.
 */
CCPViewer.ATTEMPTS = 10;

/**
 * The least time between two auth-failure rechecks. A 401 arrives on every call
 * of every section until the token is replaced, which is two calls every three
 * seconds per section. One whoami a minute is enough to put the token's age in
 * the log beside the failures.
 */
CCPViewer.RECHECK_MS = 60000;

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          log: function(...*): void}} options
 * @returns {{email: function(): string, oid: function(): string,
 *            cmsEnv: function(): string, cmsEnvWhy: function(): string,
 *            tokenExpiresIn: function(): number, tokenAge: function(): number,
 *            claimKeys: function(): string,
 *            groups: function(): string[], inGroup: function(string): boolean,
 *            refresh: function(boolean=): void, known: function(): boolean,
 *            recheck: function(string): boolean}}
 */
CCPViewer.createViewer = function (options) {
  var email = "";
  var oid = "";
  var cmsEnv = "";
  var cmsEnvWhy = "";
  // Seconds left on the presence token as of the last answered whoami. 0 means no
  // token, an unreadable one, or an expired one — the adapter does not distinguish
  // them because nothing acts differently on the difference.
  var tokenExpiresIn = 0;
  // Seconds since that token was issued. -1, not 0, for "cannot be told": 0 is a
  // token minted this second, which is the best possible answer, so an absence
  // must not be able to masquerade as it. See the adapter's _tokenAge.
  var tokenAge = -1;
  // The claim NAMES on the presence token, comma separated, "" when there is no
  // readable token. Names carry no identity, which is why the adapter is willing
  // to send them; values never come over.
  //
  // Purely a question-answering field: nothing here or in either client reads it.
  // It exists so "which claims does our token carry" can be settled from a
  // console in a live session rather than by running the auth flow by hand and
  // decoding a bearer token off a diagnostic page.
  var claimKeys = "";
  // The reader's group IDs, lower-cased by the adapter. [] until whoami answers.
  /** @type {string[]} */
  var groups = [];
  var incomplete = 0;
  var inFlight = false;
  var lastRecheck = 0;
  // getTime(), not Date.now(): the floor is document mode 5.
  var startedAt = new Date().getTime();

  function sinceStart() {
    return "+" + (new Date().getTime() - startedAt) + "ms";
  }

  // Both facts have to arrive before there is nothing left to ask for. The
  // identity could be left to turn up whenever; the environment is what presence
  // waits on, so it gets a bounded retry of its own rather than the first
  // answer's silence standing for the session.
  function settled() {
    return (!!email && !!cmsEnv) || incomplete >= CCPViewer.ATTEMPTS;
  }

  /**
   * Ask whoami, unless there is nothing left to learn or a call is already out.
   *
   * `force` SKIPS THE SETTLED CHECK, and exists for tokenExpiresIn. The two facts
   * the reconcile loop needs — identity and environment — do not change for the
   * life of a tab, which is why settled() stops the asking; the token's remaining
   * life does change, continuously, and is the one thing worth asking again for.
   * It does not get its own retry loop, because that would be a whoami every three
   * seconds for the life of every tab to service a diagnostic nobody is reading.
   * So it is pulled on demand instead, from the console handle, by whoever is
   * actually watching a replay.
   *
   * `inFlight` is NOT skipped: forcing a second call while one is outstanding would
   * race two answers into the same fields for no gain.
   *
   * @param {boolean} [force] ask even when settled
   */
  function refresh(force) {
    if ((settled() && !force) || inFlight) {
      return;
    }
    inFlight = true;
    options.call("whoami", {}, function (data) {
      inFlight = false;
      if (!data) {
        // null is the transport's timeout signal, and JSONP has no error event —
        // so this line is the ONLY evidence that the 8s watchdog fired. Worth
        // separating from a server-side error: gating anything on whoami would
        // pay this wait, and a failure rate is the thing we cannot guess at.
        options.log("whoami timed out", sinceStart());
        return;
      }
      if (data.jsonpError) {
        // Not fatal and not worth shouting about: presence still works, the reader
        // is simply counted among the others until the next attempt.
        options.log("whoami failed", data.jsonpError, sinceStart());
        return;
      }
      email = data.userEmail ? String(data.userEmail) : "";
      oid = data.oid ? String(data.oid) : "";
      cmsEnv = data.cmsEnv ? String(data.cmsEnv) : "";
      cmsEnvWhy = data.cmsEnvWhy ? String(data.cmsEnvWhy) : "";
      // Number(), guarded: an adapter that does not report it yet (an older blob
      // than this client) leaves 0 rather than NaN, which would print as "NaN" in
      // the log line below and read as a fault rather than as an absence.
      tokenExpiresIn = data.tokenExpiresIn ? Number(data.tokenExpiresIn) || 0 : 0;
      // typeof, not truthiness, because 0 is a MEANINGFUL age — a token issued
      // this second — and `data.tokenAge ? ... : -1` would throw it away as the
      // one answer we most want to see. An adapter older than this client omits
      // the field entirely and lands on -1, which is the correct "cannot be told".
      tokenAge =
        typeof data.tokenAge === "number" && !isNaN(data.tokenAge)
          ? data.tokenAge
          : -1;
      // String(), not Number(): an adapter older than this client omits it and
      // lands on "", which reads the same as a token we could not decode. Both
      // mean "cannot be told", and neither needs telling apart.
      claimKeys = data.claimKeys ? String(data.claimKeys) : "";
      groups = readGroups(data.groups);
      if (!email || !cmsEnv) {
        incomplete = incomplete + 1;
      }
      options.log(
        "whoami",
        sinceStart(),
        email ? "identified" : "no identity in token",
        // The elapsed time above is how long presence waited to register: this
        // is the value the suffix is built from, and nothing is named until it
        // arrives. An empty one means nothing registers at all, so the reason
        // is on the same line.
        "cmsEnv=" + (cmsEnv ? cmsEnv : "(none)"),
        "why=" + (cmsEnvWhy ? cmsEnvWhy : "(not reported)"),
        // Watched over a session rather than read once: this is where a failing
        // auth replay becomes visible. Age is the one to read — see the header on
        // why a falling expiry proves nothing either way.
        "tokenAge=" + tokenAge,
        "tokenExpiresIn=" + tokenExpiresIn,
        // Last because it is the longest and the least often wanted: a reader
        // scanning for the replay numbers above should not have to step over it.
        "claims=" + (claimKeys ? claimKeys : "(none)"),
        // A COUNT, never the IDs: this ring buffer is what gets copied out of a
        // console and pasted into a ticket.
        "groups=" + groups.length
      );
      // Said ONCE, on the pass that stops asking, because this is the line that
      // explains a client which never registered anything at all.
      if (incomplete === CCPViewer.ATTEMPTS) {
        options.log("still " + (cmsEnv ? "no identity" : "no CMS environment") + " after " + incomplete + " attempts — giving up" + (cmsEnv ? "" : "; presence will not register"));
      }
    });
  }

  // A copy of the strings only. The value came from an evaluated JSONP body, so it
  // is checked for shape rather than trusted: anything that is not a list of
  // strings yields fewer groups, never more. No Array.isArray at document mode 5,
  // hence the length test — and a string has a length too, so it is ruled out first.
  /**
   * @param {*} value
   * @returns {string[]}
   */
  function readGroups(value) {
    /** @type {string[]} */
    var out = [];
    var i;
    if (!value || typeof value === "string" || typeof value.length !== "number") {
      return out;
    }
    for (i = 0; i < value.length; i++) {
      if (typeof value[i] === "string" && value[i]) {
        out.push(value[i].toLowerCase());
      }
    }
    return out;
  }

  refresh();

  return {
    email: function () {
      return email;
    },
    oid: function () {
      return oid;
    },
    cmsEnv: function () {
      return cmsEnv;
    },
    cmsEnvWhy: function () {
      return cmsEnvWhy;
    },
    tokenExpiresIn: function () {
      return tokenExpiresIn;
    },
    tokenAge: function () {
      return tokenAge;
    },
    claimKeys: function () {
      return claimKeys;
    },
    // A copy, so a caller cannot edit what the next inGroup reads.
    groups: function () {
      return groups.slice(0);
    },
    // Whether the reader is a member of this group, case-insensitively.
    inGroup: function (id) {
      var want = String(id || "").toLowerCase();
      return !!want && CCPUtil.indexOf(groups, want) !== -1;
    },
    known: function () {
      return !!email;
    },
    refresh: refresh,
    /**
     * An API call was refused for its credential. Ask whoami again, at most once a
     * RECHECK_MS, so the whoami line it logs puts tokenAge and tokenExpiresIn next
     * to the failure. That separates "the token ran out because the auth replay is
     * not working" from a network problem, which otherwise look the same.
     *
     * @param {string} reason what the API said, for the log
     * @returns {boolean} whether a whoami was sent
     */
    recheck: function (reason) {
      var at = new Date().getTime();
      if (lastRecheck && at - lastRecheck < CCPViewer.RECHECK_MS) {
        return false;
      }
      lastRecheck = at;
      options.log("auth refused (" + reason + ") — re-asking whoami for the token's age", sinceStart());
      refresh(true);
      return true;
    }
  };
};
