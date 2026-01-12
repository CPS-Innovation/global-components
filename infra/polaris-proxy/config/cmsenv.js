const _applyGlobalReplacements = (source, replacements) =>
  replacements.reduce(
    (prev, curr) => (prev = prev.replace(new RegExp(curr[0], "g"), curr[1])),
    source
  );

const _getDomainFromCookie = (r) =>
  (r.headersIn.Cookie || "").match(/([a-z0-9]+)\.cps\.gov\.uk/)[0];

const _getCmsEnv = (r, inOrOut) => {
  const cookie =
    inOrOut === "out" ? r.headersOut["Set-Cookie"][0] : r.headersIn.Cookie;
  if (!cookie || cookie.includes("cin3")) return "default";
  if (cookie.includes("cin2")) return "cin2";
  if (cookie.includes("cin4")) return "cin4";
  if (cookie.includes("cin5")) return "cin5";
  return "default";
};

const _getUpstreamVariable = (variableSuffix) => (r) =>
  r.variables[_getCmsEnv(r) + variableSuffix];

const _getProxyDestination = (variableSuffix) => (r) =>
  r.variables.endpointHttpProtocol +
  "://" +
  r.variables[_getCmsEnv(r) + variableSuffix];

const _replaceCmsDomains = (hostVariableName) => (r, data, flags) => {
  // If a 302 has been issued then there's no point in processing in the response body
  if (r.status === 302) {
    r.sendBuffer(data, flags);
    return;
  }

  const replacements = [
    "UpstreamCmsModernDomainName",
    "UpstreamCmsServicesDomainName",
    "UpstreamCmsDomainName",
    "UpstreamCmsIpCorsham",
    "UpstreamCmsModernIpCorsham",
    "UpstreamCmsIpFarnborough",
    "UpstreamCmsModernIpFarnborough",
  ]
    .map((suffix) =>
      // FCT2-13548: Not sure about this. The logic for a long time has been to
      // strip -=./ chars from the incoming variables. There have not been any
      // problems so far so keeping this in place.
      _applyGlobalReplacements(r.variables[_getCmsEnv(r) + suffix], [
        ["[-=./]", ""],
      ])
    )
    .map((cleanedVariable) => [cleanedVariable, r.variables[hostVariableName]]);

  r.sendBuffer(_applyGlobalReplacements(data, replacements), flags);
};

const _addAppButtons = (data) =>
  _applyGlobalReplacements(data, [
    [
      "objMainWindow.top.frameData.objMasterWindow.top.frameServerJS.POLARIS_URL",
      '"/polaris"',
    ],
    [
      "MENU_BAR_POLARIS_LOGO",
      '"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAJKSURBVEhLtZXPS9tgGMe/6Q9r01Y7pyiWlWFRmTpXNybOy2AIO6gTBwpWYV4Ezz3sH1AP/gPuphdF1It49bLD8FAnMoa0MBXGJrYeiiFNbU2b+OTHac2yRNYPNHngffJ++zzfJ28YmUAVcej3qmFawfr6d8iyBIYBampcKJeBqaluiGIZbrdTzzLHVIBlP+LmpqjGLpcPXq8DR0dxrK5+xcDAQ4yNvVDXzDBtUTAYoGu9EqGhoQ7NzUESOMfgYAjb2yns75/h5CSt5v4Nyx4wjIxi0UFVsNjZSSIWe47Fxc9oa2tEMnmlZ1Vi2qLW1gVcXooUMQgEnJidjSKXKyGd5mktiJ6eehwe/sTGxgftAQMsV8DzBczPv6L+v8fISCdt/Fv999FohPz4pGdVYmtMeV4zfG7uJdrbH2Bv7weamnxYWnqL21saMQPu9R44nQxKJRkcJ9KUichkBEiScadtCfj9HvW+ufmNNs1hZqYb2WweKytfUFvrUtf+xKbJz5DPSzg9zaKjoxGRiB+pVAZrazHtAQMsV8CybuzunmF0tBPhcB36+0M4OEhjefkdEolfelYllgWUOj0eiXqex/j4E9r8HJOTT3FxwZHYIz2rEssCDB1IHCfQWD7G8fEVhobCmJ7uRV9fSM8wxrIHXi8Qj7+mt/cNBKEIn08z/F9YrkAZx4mJLjW2urmCrTEtFEp6ZB1bAsp3wS6mAtfXAl15/Zej09T4ODDD1OStrQQZqn3RJEnC8HAvWlr8+qo1TAX+B7Y8uA9VFgDuAGLN1z00rPbxAAAAAElFTkSuQmCC"',
    ],
  ]);

const _appendEnvCookies = (r, env) => {
  let cookies = env
    ? [`__CMSENV=${env === "cin3" ? "default" : env}; path=/`]
    : ["__CMSENV=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"];

  ["cin2", "cin3", "cin4", "cin5"]
    .filter((e) => e !== env)
    .forEach((e) => {
      cookies = cookies.concat(
        ["CPSACP", "CPSAFP"].map(
          (lb) =>
            `BIGipServer~ent-s221~${lb}-LTM-CM-WAN-${e.toUpperCase()}-${e}.cps.gov.uk_POOL=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
        )
      );
    });

  r.headersOut["Set-Cookie"] = (r.headersOut["Set-Cookie"] || []).concat(
    cookies
  );
};

const devLoginCookieHandler = (r) =>
  _appendEnvCookies(
    r,
    r.variables.request_method === "POST" ? _getCmsEnv(r, "out") : undefined
  );

const cmsMenuBarFilters = (r, data, flags) => {
  data = _addAppButtons(data);
  _replaceCmsDomains("host")(r, data, flags);
};

const switchEnvironment = (r) => {
  const ua = r.headersIn["User-Agent"] || "";
  const isIE = /Trident/i.test(ua);
  const configHeader = r.headersIn["X-InternetExplorerModeConfigurable"];
  const isConfigurable = configHeader === "1";

  // IE mode check - non-IE without configurable header returns 402
  if (!isIE && !isConfigurable) {
    r.return(402, "requires Internet Explorer mode");
    return;
  }
  // Non-IE with configurable header - redirect to trigger IE mode
  if (!isIE && isConfigurable) {
    r.headersOut["X-InternetExplorerMode"] = "1";
    r.return(302, r.variables.websiteScheme + "://" + r.headersIn.Host + r.uri);
    return;
  }

  // Extract environment from URI (e.g., /cin2 -> cin2)
  _appendEnvCookies(r, r.uri.substring(1));
  r.return(302, r.variables.websiteScheme + "://" + r.headersIn.Host + "/CMS");
};

export default {
  proxyDestinationCorsham: _getProxyDestination("UpstreamCmsIpCorsham"),
  proxyDestinationCorshamInternal: _getProxyDestination("UpstreamCmsIpCorsham"),
  proxyDestinationModernCorsham: _getProxyDestination(
    "UpstreamCmsModernIpCorsham"
  ),
  proxyDestinationModernCorshamInternal: _getProxyDestination(
    "UpstreamCmsModernIpCorsham"
  ),
  proxyDestinationFarnborough: _getProxyDestination("UpstreamCmsIpFarnborough"),
  proxyDestinationFarnboroughInternal: _getProxyDestination(
    "UpstreamCmsIpFarnborough"
  ),
  proxyDestinationModernFarnborough: _getProxyDestination(
    "UpstreamCmsModernIpFarnborough"
  ),
  proxyDestinationModernFarnboroughInternal: _getProxyDestination(
    "UpstreamCmsModernIpFarnborough"
  ),
  upstreamCmsDomainName: _getUpstreamVariable("UpstreamCmsDomainName"),
  upstreamCmsModernDomainName: _getUpstreamVariable(
    "UpstreamCmsModernDomainName"
  ),
  upstreamCmsServicesDomainName: _getUpstreamVariable(
    "UpstreamCmsServicesDomainName"
  ),
  upstreamCmsIpCorsham: _getUpstreamVariable("UpstreamCmsIpCorsham"),
  upstreamCmsModernIpCorsham: _getUpstreamVariable(
    "UpstreamCmsModernIpCorsham"
  ),
  upstreamCmsIpFarnborough: _getUpstreamVariable("UpstreamCmsIpFarnborough"),
  upstreamCmsModernIpFarnborough: _getUpstreamVariable(
    "UpstreamCmsModernIpFarnborough"
  ),
  replaceCmsDomains: _replaceCmsDomains("host"),
  replaceCmsDomainsAjaxViewer: _replaceCmsDomains("websiteHostname"),
  cmsMenuBarFilters,
  devLoginCookieHandler,
  getDomainFromCookie: _getDomainFromCookie,
  switchEnvironment,
};
