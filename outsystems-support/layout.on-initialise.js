function navigationHelper() {
  const eventName = "cps-global-header-event";

  if (window.cpsComponentsRegisteredNavListener) {
    document.removeEventListener(
      eventName,
      window.cpsComponentsRegisteredNavListener
    );
  }

  window.cpsComponentsRegisteredNavListener = (event) =>
    $public.Navigation.navigateTo(event.detail);

  document.addEventListener(
    eventName,
    window.cpsComponentsRegisteredNavListener
  );
}

function scriptHelper() {
  if (window.cpsComponentsHaveLoadedScript) {
    return;
  }

  const firstDomainChunk = window.location.hostname
    .split(".")[0]
    .toLocaleLowerCase();
  let environment;
  switch (firstDomainChunk) {
    case "cps":
      environment = "production";
      break;
    case "cps-tst":
      environment = "test";
      break;
    case "cps-dev":
      environment = "dev";
      break;
    case "personal-3hxfhjxg":
      environment = "unstable";
      break;
    default:
      alert(
        `The LayoutCPS -> OnInitialize -> JavaScript does not recognise this domain: ${window.location.hostname}. Please check the script in Service Studio.`
      );
  }

  const script = document.createElement("script");
  script.type = "module";
  script.referrerPolicy = "no-referrer-when-downgrade";
  script.src = `https://sacpsglobalcomponents.blob.core.windows.net/${environment}/cps-global-components.js`;

  document.head.appendChild(script);
  window.cpsComponentsHaveLoadedScript = true;
}

scriptHelper();
navigationHelper();
