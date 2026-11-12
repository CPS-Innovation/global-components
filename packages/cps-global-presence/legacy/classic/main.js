/* legacy/classic/main.js — CMS Classic's presence client: the frame readers
 * (sections.js) and the footer stripe (stripe.js) on the shared loop (CCPClient).
 *
 * NOTHING STARTS unless CMS_WATCHDOG_ENABLED (shared/kill-switch.js): no call, no
 * stripe, no handle.
 */

var presenceClient = null;

if (CMS_WATCHDOG_ENABLED === true) {
  presenceClient = CCPClient.createClient({
    appName: "CMS Classic",
    sections: activeSections,
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
