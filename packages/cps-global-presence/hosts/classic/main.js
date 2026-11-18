/* hosts/classic/main.js — what runs in CMS Classic. The launcher decides when.
 *
 * Classic's login watcher (auth.js) is a separate IIFE on purpose, so a failure here
 * cannot stop the sign-in that everything else depends on.
 */

var presenceClient = CCPLauncher.launch({
  appName: "CMS Classic",
  features: [
    function (platform) {
      return CCPWatchdog.createFeature(platform, {
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
    }
  ]
});

if (presenceClient) {
  window.attachEvent("onunload", presenceClient.stop);
  presenceClient.start();
}
