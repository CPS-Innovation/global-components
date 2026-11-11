/* apps/classic/main.js — CMS Classic's presence client: the frame readers
 * (sections.js) and the footer stripe (stripe.js) on the shared loop (CCPClient).
 *
 * Classic hides the stripe on any failed call and puts it back when every section
 * answers again, and drops a section on a non-410 error so the next pass starts it
 * afresh. It writes nothing to the console unless asked: an unexpected console
 * call inside an old document mode is a real risk in someone else's application.
 *
 * NOTHING STARTS unless CMS_WATCHDOG_ENABLED (kill-switch.js): no call, no stripe,
 * no handle.
 */

var presenceClient = null;

if (CMS_WATCHDOG_ENABLED === true) {
  presenceClient = CCPClient.createClient({
    appName: "CMS Classic",
    sections: activeSections,
    passMs: 3000,
    echo: false,
    hideOnTrouble: true,
    dropSectionOnError: true,
    render: function (view) {
      if (view) {
        presenceShowStripe(view);
      } else {
        presenceRemoveStripe();
      }
    },
    // CMS replaces the footer document on navigations that change nothing we
    // observe, taking the stripe with it; put it back. Cheap when nothing changed.
    afterPass: presenceRefreshStripe,
    diagnostics: { stripe: presenceStripeSnapshot }
  });
  window.attachEvent("onunload", presenceClient.stop);
  presenceClient.start();
}
