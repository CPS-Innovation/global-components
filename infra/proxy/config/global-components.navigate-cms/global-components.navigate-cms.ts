function handleNavigateCms(r: NginxHTTPRequest): void {
  var ieaction = r.variables.ieaction || "";
  var step = r.args.step || "";
  var proto = r.headersIn["X-Forwarded-Proto"] || "https";
  var host = r.headersIn["Host"] || "";

  // === CLOSE PHASE ===
  if (step === "close") {
    // If in IE mode with configurable: redirect to self to exit IE mode
    if (ieaction === "ie+configurable+") {
      r.headersOut["X-InternetExplorerMode"] = "0";
      r.return(302, proto + "://" + host + r.uri + "?step=close");
      return;
    }
    // Now in Edge (or non-configurable): close the window
    r.headersOut["Content-Type"] = "text/html";
    r.return(200, "<html><body><script>window.close();</script></body></html>");
    return;
  }

  // === OPEN PHASE ===
  // If non-IE browser with configurable IE mode: extract CMS domain from
  // cookie (only available in Edge, not in IE mode) and pass it as a query
  // param so IE mode can use it.
  if (ieaction === "nonie+configurable+") {
    var domain = extractDomainFromSessionHint(r);
    if (!domain) {
      r.headersOut["Content-Type"] = "text/html";
      r.return(400, "<html><body><p>Error: could not determine CMS domain from session.</p></body></html>");
      return;
    }
    var args = r.variables.args || "";
    var separator = args ? "&" : "";
    r.headersOut["X-InternetExplorerMode"] = "1";
    r.return(302, proto + "://" + host + r.uri + "?" + args + separator + "cmsDomain=" + encodeURIComponent(domain));
    return;
  }

  // Now in IE mode (or non-configurable): get domain from query param (IE) or cookie (non-configurable)
  var cmsDomain = r.args.cmsDomain || extractDomainFromSessionHint(r);
  if (!cmsDomain) {
    r.headersOut["Content-Type"] = "text/html";
    r.return(400, "<html><body><p>Error: could not determine CMS domain from session.</p></body></html>");
    return;
  }

  var caseId = r.args.caseId || "";
  var taskId = r.args.taskId || "";
  var iframeSrc = taskId
    ? proto + "://" + cmsDomain + "/CMSModern/Navigation/Notification.html?action=activate_task&screen=case_details&wId=MASTER&taskId=" + taskId + "&caseId=" + caseId
    : proto + "://" + cmsDomain + "/CMSModern/Navigation/Notification.html?action=navigate&screen=case_details&wId=MASTER&caseId=" + caseId;

  var closeUrl = "/global-components/navigate-cms?step=close";

  var heading = taskId ? "Opening task in CMS" : "Opening case in CMS";

  r.headersOut["Content-Type"] = "text/html";
  r.return(200, "<!DOCTYPE html>"
    + "<html><head><title>" + heading + "</title></head>"
    + '<body style="font-family: Arial, sans-serif; margin: 30px;">'
    + '<h1 style="font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">' + heading + "</h1>"
    + '<div style="border-left: 10px solid #b1b4b6; padding: 15px; margin: 0; clear: both;">'
    + "<p style=\"font-size: 16px; margin: 0 0 10px 0;\">This may take a few seconds.</p>"
    + "<p style=\"font-size: 16px; margin: 0;\">Please do not close this window. It will close automatically when CMS has finished navigating.</p>"
    + "</div>"
    + '<iframe src="' + iframeSrc + '" style="display:none" onload="window.location.href=\'' + closeUrl + '\'"></iframe>'
    + "</body></html>");
}

function extractDomainFromSessionHint(r: NginxHTTPRequest): string {
  var cookies = (r.headersIn["Cookie"] as string) || "";
  var match = cookies.match(/Cms-Session-Hint=([^;]+)/);
  if (!match) return "";
  try {
    var decoded = decodeURIComponent(match[1]);
    var parsed = JSON.parse(decoded);
    var endpoint = parsed.handoverEndpoint || "";
    var domainMatch = endpoint.match(/https?:\/\/([^\/]+)/);
    return domainMatch ? domainMatch[1] : "";
  } catch (e) {
    return "";
  }
}

export default { handleNavigateCms };
