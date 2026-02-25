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
  // If non-IE browser with configurable IE mode: redirect to self to enter IE mode
  if (ieaction === "nonie+configurable+") {
    r.headersOut["X-InternetExplorerMode"] = "1";
    r.return(302, proto + "://" + host + r.uri + "?" + (r.variables.args || ""));
    return;
  }

  // Now in IE mode (or non-configurable): extract CMS domain from cookie and serve iframe page
  var domain = extractDomainFromSessionHint(r);
  if (!domain) {
    r.headersOut["Content-Type"] = "text/html";
    r.return(400, "<html><body><p>Error: could not determine CMS domain from session.</p></body></html>");
    return;
  }

  var caseId = r.args.caseId || "";
  var taskId = r.args.taskId || "";
  var iframeSrc = taskId
    ? proto + "://" + domain + "/CMSModern/Navigation/Notification.html?action=activate_task&screen=case_details&wId=MASTER&taskId=" + taskId + "&caseId=" + caseId
    : proto + "://" + domain + "/CMSModern/Navigation/Notification.html?action=navigate&screen=case_details&wId=MASTER&caseId=" + caseId;

  var closeUrl = "/global-components/navigate-cms?step=close";

  r.headersOut["Content-Type"] = "text/html";
  r.return(200, "<html><body>"
    + "<p>Please wait, opening CMS...</p>"
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
