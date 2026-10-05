// ---------------------------------------------------------------------------
// CMS Proxy njs handlers
//
// Intercepts the CMS login page GET to prevent .CMSAUTH cookie destruction,
// allowing users to return to an existing session without re-entering credentials.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _getCookie(r: NginxHTTPRequest, name: string): string | null {
  const cookies = r.headersIn["Cookie"]
  if (!cookies) return null
  const match = (cookies as string).match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)")
  )
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// CMS Login intercept
// ---------------------------------------------------------------------------

async function handleCmsLoginIntercept(r: NginxHTTPRequest): Promise<void> {
  const cmsAuth = _getCookie(r, ".CMSAUTH")

  if (r.method === "GET" && cmsAuth) {
    // User has an existing session — skip the login page (which would destroy
    // the .CMSAUTH cookie) and redirect the frame to the session bootstrap
    // page, mimicking what uaulLogin.aspx returns after a successful POST.
    r.headersOut["Content-Type"] = "text/html"
    const taskListUrl = `https://${r.headersIn["Host"]}/_CMS.24.0.01/Tasks/uatlTaskList.aspx`
    r.return(
      200,
      `<html><body><script>top.frameMain.location.href="/_CMS.24.0.01/Includes/uainGeneratedScript.aspx?strURL=${encodeURIComponent(taskListUrl)}";</script></body></html>`
    )
    return
  }

  // No session cookie — let the real login page through
  r.internalRedirect("@cms_login_upstream")
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  handleCmsLoginIntercept,
}
