declare const __SCRIPT_URL__: string;
declare const __BEACON_URL__: string;

(function () {
  try {
    new Image().src = __BEACON_URL__ + "?page=" + encodeURIComponent(window.location.href);
  } catch {
    // Beacon must never interfere with the redirect itself.
  }

  const script = document.createElement("script");
  script.type = "module";
  script.referrerPolicy = "no-referrer-when-downgrade";
  script.src = __SCRIPT_URL__;
  document.head.appendChild(script);
})();
