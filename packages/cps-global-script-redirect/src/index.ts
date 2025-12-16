declare const __SCRIPT_URL__: string;

(function () {
  const script = document.createElement("script");
  script.type = "module";
  script.referrerPolicy = "no-referrer-when-downgrade";
  script.src = __SCRIPT_URL__;
  document.head.appendChild(script);
})();
