/* legacy/modern/main.js — CMS Modern and DCF's presence client: the URL detectors
 * (sections.js) and the pinned banner (bar.js) on the shared loop (CCPClient).
 *
 * The banner stays up through a failed call; the sessions layer retries. Modern
 * changes case without a page load, so a hashchange runs a pass straight away.
 */

var presenceClient = CCPClient.createClient({
  appName: "CMS Modern", // DCF too: one application in users' minds
  sections: activeSections,
  passMs: 2000,
  echo: true,
  render: function (view) {
    renderBanner(view || { count: 0, summary: "", lines: [] });
  },
  diagnostics: { location: describeLocation }
});

if (window.addEventListener) {
  window.addEventListener("hashchange", presenceClient.reconcile, false);
  window.addEventListener("unload", presenceClient.stop, false);
}
presenceClient.start();
