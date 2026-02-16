const _filterBody = (replacementGetters) => (r, data, flags) => {
  // If a 302 has been issued then there's no point in processing in the response body
  if (r.status === 302) {
    r.sendBuffer(data, flags);
    return;
  }
  const replacements = replacementGetters.reduce(
    (acc, curr) => acc.concat(curr(r, data, flags)),
    []
  );

  data = replacements.reduce(
    (prev, curr) => (prev = prev.replace(new RegExp(curr[0], "g"), curr[1])),
    data
  );

  r.sendBuffer(data, flags);
};

const _parseFormData = (body) =>
  (body || "").split("&").reduce((acc, pair) => {
    const parts = pair.split("=");
    var key = decodeURIComponent(parts[0] || "");
    var value = decodeURIComponent(parts[1] || "");
    acc[key] = value;
    return acc;
  }, {});

const _getUpstreamVariable = (variableSuffix) => (r) => {
  const cookie = r.headersIn.Cookie;
  const env = !cookie
    ? "default"
    : cookie.includes("cin3")
    ? "default"
    : cookie.includes("cin2")
    ? "cin2"
    : cookie.includes("cin4")
    ? "cin4"
    : cookie.includes("cin5")
    ? "cin5"
    : "default";
  return process.env[env + variableSuffix];
};

const _cmsDomainReplacements = (hostVariableName) => (r, data, flags) =>
  [
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
      _getUpstreamVariable(suffix)(r).replace(new RegExp("[-=./]", "g"), "")
    )
    .map((cleanedVariable) => [cleanedVariable, process.env[hostVariableName]]);

const _appButtonReplacements = (r, data, flags) => [
  [
    "objMainWindow.top.frameData.objMasterWindow.top.frameServerJS.POLARIS_URL",
    '"/polaris"',
  ],
  [
    "MENU_BAR_POLARIS_LOGO",
    '"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAJKSURBVEhLtZXPS9tgGMe/6Q9r01Y7pyiWlWFRmTpXNybOy2AIO6gTBwpWYV4Ezz3sH1AP/gPuphdF1It49bLD8FAnMoa0MBXGJrYeiiFNbU2b+OTHac2yRNYPNHngffJ++zzfJ28YmUAVcej3qmFawfr6d8iyBIYBampcKJeBqaluiGIZbrdTzzLHVIBlP+LmpqjGLpcPXq8DR0dxrK5+xcDAQ4yNvVDXzDBtUTAYoGu9EqGhoQ7NzUESOMfgYAjb2yns75/h5CSt5v4Nyx4wjIxi0UFVsNjZSSIWe47Fxc9oa2tEMnmlZ1Vi2qLW1gVcXooUMQgEnJidjSKXKyGd5mktiJ6eehwe/sTGxgftAQMsV8DzBczPv6L+v8fISCdt/Fv999FohPz4pGdVYmtMeV4zfG7uJdrbH2Bv7weamnxYWnqL21saMQPu9R44nQxKJRkcJ9KUichkBEiScadtCfj9HvW+ufmNNs1hZqYb2WweKytfUFvrUtf+xKbJz5DPSzg9zaKjoxGRiB+pVAZrazHtAQMsV8CybuzunmF0tBPhcB36+0M4OEhjefkdEolfelYllgWUOj0eiXqex/j4E9r8HJOTT3FxwZHYIz2rEssCDB1IHCfQWD7G8fEVhobCmJ7uRV9fSM8wxrIHXi8Qj7+mt/cNBKEIn08z/F9YrkAZx4mJLjW2urmCrTEtFEp6ZB1bAsp3wS6mAtfXAl15/Zej09T4ODDD1OStrQQZqn3RJEnC8HAvWlr8+qo1TAX+B7Y8uA9VFgDuAGLN1z00rPbxAAAAAElFTkSuQmCC"',
  ],
];

const _loginPageEnvIndicator = (r, data, flags) => {
  const cookie = r.headersIn.Cookie;
  if (!cookie) return [];
  const match = cookie.match(/__CMSENV=([^;]+)/);
  if (!match) return [];
  const value = match[1];
  // Transpose "default" back to "cin3" for display
  const env = value === "default" ? "cin3" : value;
  if (!env) return [];
  // Note: () must be escaped as the pattern is used in new RegExp()
  return [
    [
      'onpropertychange="toggleButton\\(\\)">',
      'onpropertychange="toggleButton()"><span style="white-space:nowrap;margin-left:8px;color:#666;font-size:11px;">attached to ' +
        env +
        "</span>",
    ],
  ];
};

const _alignCookiesToEnv = (envGetter) => (r) => {
  const env = envGetter(r);
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

export default {
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

  replaceCmsDomains: _filterBody([_cmsDomainReplacements("host")]),
  replaceCmsDomainsAjaxViewer: _filterBody([
    _cmsDomainReplacements("websiteHostname"),
  ]),
  cmsMenuBarFilters: _filterBody([
    _appButtonReplacements,
    _cmsDomainReplacements("host"),
  ]),
  loginPageFilters: _filterBody([
    _loginPageEnvIndicator,
    _cmsDomainReplacements("host"),
  ]),

  switchEnvironment: _alignCookiesToEnv((r) => r.uri.substring(1)),
  switchEnvironmentDevLogin: _alignCookiesToEnv(
    (r) => _parseFormData(r.requestText)["selected-environment"]
  ),
};
