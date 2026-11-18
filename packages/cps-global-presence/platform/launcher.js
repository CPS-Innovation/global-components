/* platform/launcher.js — starts and stops the features. MODE 5 FLOOR.
 *
 * A host's main.js names its features and calls launch(). The rules every feature
 * shares live here and nowhere else:
 *
 *   the kill switch off      nothing is created: no call, no timer, no handle
 *   outside the Entra rollout  every feature is stopped, whatever its gate says
 *   otherwise                a feature runs while its gate is open
 *
 * THE ANSWERS ARRIVE LATE AND CAN CHANGE. Groups come back with whoami, preview flags
 * on their own call, and a forced whoami can take groups away. So gates are asked
 * again on every pass rather than once at boot.
 *
 * A FEATURE is made by a factory, given the platform, so a page with the kill switch
 * off never runs any feature code:
 *
 *   {
 *     name:     "watchdog",
 *     gate:     function () { return true; },  should it run? asked every pass
 *     observe:  function () {},                optional: every pass, open or closed
 *     start:    function () {},                optional: the gate has opened
 *     pass:     function () {},                optional: every pass while running
 *     stop:     function () {}                 optional: the gate has closed, or the page is going
 *   }
 *
 * pass is a convenience. A feature that needs another rhythm sets its own timer in
 * start and clears it in stop.
 *
 * ONE FEATURE CANNOT TAKE ANOTHER DOWN. Every call into a feature is guarded. A gate
 * that throws counts as closed, and a feature whose start throws stays down until the
 * page reloads rather than retrying against a page it has already failed on.
 */

var CCPLauncher = {};

// How often a pass runs. Frequent because Classic has no event for a frame navigation.
CCPLauncher.PASS_MS = 2000;

/**
 * @param {{appName: string, features: Array<function(*): *>}} o
 * @returns {?{start: function(): void, stop: function(): void, reconcile: function(): void,
 *             feature: function(string): *}} null when the kill switch is off
 */
CCPLauncher.launch = function (o) {
  if (LEGACY_CLIENT_AUGMENTATION_ENABLED !== true) {
    return null;
  }

  var platform = CCPPlatform.createPlatform({ appName: o.appName });
  var log = platform.log;
  var timer = null;
  /** @type {Array<{feature: *, running: boolean, broken: boolean}>} */
  var slots = [];

  // Runs one optional hook, reporting whether it completed.
  function hook(slot, name) {
    try {
      if (slot.feature[name]) {
        slot.feature[name]();
      }
      return true;
    } catch (e) {
      log("feature", slot.feature.name, name, "threw", String(e));
      return false;
    }
  }

  function wanted(slot) {
    if (slot.broken || !platform.inRollout()) {
      return false;
    }
    try {
      return slot.feature.gate() === true;
    } catch (e) {
      log("feature", slot.feature.name, "gate threw", String(e));
      return false;
    }
  }

  function stopSlot(slot, why) {
    slot.running = false;
    log("feature", slot.feature.name, "stopped", why);
    hook(slot, "stop");
  }

  function startSlot(slot) {
    slot.running = true;
    log("feature", slot.feature.name, "started");
    if (!hook(slot, "start")) {
      slot.broken = true;
      stopSlot(slot, "(failed to start)");
    }
  }

  function reconcile() {
    var i, slot, want;
    try {
      platform.refresh();
    } catch (e) { }
    for (i = 0; i < slots.length; i++) {
      slot = slots[i];
      hook(slot, "observe");
      want = wanted(slot);
      if (slot.running && !want) {
        stopSlot(slot, "(gate closed)");
      } else if (!slot.running && want) {
        startSlot(slot);
      }
      if (slot.running) {
        hook(slot, "pass");
      }
    }
  }

  function start() {
    if (timer) {
      return;
    }
    reconcile();
    timer = window.setInterval(reconcile, CCPLauncher.PASS_MS);
  }

  // Stops every running feature. start() picks up again.
  function stop() {
    var i;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    for (i = 0; i < slots.length; i++) {
      if (slots[i].running) {
        stopSlot(slots[i], "(page stopping)");
      }
    }
  }

  function feature(name) {
    var i;
    for (i = 0; i < slots.length; i++) {
      if (slots[i].feature.name === name) {
        return slots[i].feature;
      }
    }
    return null;
  }

  // Features' own console handles offer these too.
  /** @type {*} */ (platform).loop = { reconcile: reconcile, start: start, stop: stop };

  var n;
  for (n = 0; n < o.features.length; n++) {
    slots.push({ feature: o.features[n](platform), running: false, broken: false });
  }

  /** @type {*} */ (window).__ccPlatform = {
    // Each feature, and whether it is running. broken means its start threw.
    features: function () {
      var out = [];
      var i;
      for (i = 0; i < slots.length; i++) {
        out.push({ name: slots[i].feature.name, running: slots[i].running, broken: slots[i].broken });
      }
      return out;
    },
    whoami: platform.whoami,
    inRollout: platform.inRollout,
    dump: function () {
      return platform.logBuffer.dump();
    },
    reconcile: reconcile
  };

  log("client loaded", o.appName, "base=" + platform.base);

  return { start: start, stop: stop, reconcile: reconcile, feature: feature };
};
