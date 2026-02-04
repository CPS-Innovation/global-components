// CMS Login Ping — njs module
//
// Placeholder for future ping-handling logic. Currently the login ping
// injection is handled purely by sub_filter in global-components.cms-ping.conf.
// When we add server-side reaction to the /polaris?ping request (e.g. reading
// .CMSAUTH cookie value and storing it), that logic will live here.

function placeholder(r: NginxHTTPRequest): void {
  r.return(200, "cms-ping module loaded");
}

export default { placeholder };
