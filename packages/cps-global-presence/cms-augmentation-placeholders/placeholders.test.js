/* Unit tests for the cms-augmentation placeholders.
 *
 * These will be linked from the real CMS, in someone else's application, where an
 * uncaught error can surface as a script-error dialog in front of a caseworker. So
 * the property worth proving is not that they log -- it is that they never throw,
 * whatever the page's console turns out to be.
 */
var h = require("../test-harness");

var CLIENTS = ["cms-augmentation-placeholders/client-classic.js", "cms-augmentation-placeholders/client-modern.js"];

function run(file, window) {
  // Nothing is exported; the harness wants a names list, so ask for none.
  return h.load([file], [], { window: window });
}

CLIENTS.forEach(function (file) {
  h.describe(file);

  h.test("says hello when there is a console", function () {
    var logged = [];
    run(file, { console: { log: function (m) { logged.push(m); } } });
    h.assertEqual(logged.length, 1);
    h.assertEqual(logged[0].indexOf("Hello, world") === 0, true);
  });

  // Old document modes can leave window.console undefined until the developer
  // tools are opened. Calling it anyway would throw into the host page.
  h.test("is silent, and does not throw, when there is no console", function () {
    run(file, {});
  });

  h.test("does not throw when console exists but log does not", function () {
    run(file, { console: {} });
  });

  // The belt to go with those braces: whatever the host has done to console.log,
  // the failure stays inside the placeholder.
  h.test("does not throw when console.log itself throws", function () {
    run(file, { console: { log: function () { throw new Error("host console is broken"); } } });
  });
});
