/* hosts/modern/main.js — what runs in CMS Modern and DCF. The launcher decides when.
 *
 * Modern changes case without a page load, so a hashchange runs a pass straight
 * away.
 */

var presenceClient = CCPLauncher.launch({
  appName: "CMS Modern", // DCF too: one application in users' minds
  features: [
    function (platform) {
      return CCPWatchdog.createFeature(platform, {
        sections: activeSections,
        render: function (view) {
          renderBanner(view || { count: 0, summary: "", lines: [] });
        },
        diagnostics: { location: describeLocation }
      });
    }
  ]
});

if (presenceClient) {
  if (window.addEventListener) {
    window.addEventListener("hashchange", presenceClient.reconcile, false);
    window.addEventListener("unload", presenceClient.stop, false);
  }
  presenceClient.start();
}
