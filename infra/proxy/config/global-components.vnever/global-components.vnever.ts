const HEALTHCHECK_ALLOWED_URLS = [
  "https://polaris.cps.gov.uk/polaris",
  "https://cms.cps.gov.uk/polaris",
  "https://polaris-qa-notprod.cps.gov.uk/polaris",
  "https://cin2.cps.gov.uk/polaris",
  "https://cin3.cps.gov.uk/polaris",
  "https://cin4.cps.gov.uk/polaris",
  "https://cin5.cps.gov.uk/polaris",
  "http://mock-upstream:3000/api/health", // For testing
]
const HEALTHCHECK_TIMEOUT_MS = 2_000

interface HealthCheckResponse {
  url: string
  status: number
  healthy: boolean
  error?: string
}

async function handleHealthCheck(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"

  const url = r.args.url as string | undefined

  if (!url) {
    r.return(400, JSON.stringify({ error: "url parameter required" }))
    return
  }

  // Whitelist check
  const allowedUrls = HEALTHCHECK_ALLOWED_URLS || []
  if (!allowedUrls.includes(url)) {
    r.return(403, JSON.stringify({ error: "url not in whitelist", url }))
    return
  }

  try {
    const response = await ngx.fetch(url, { method: "GET", timeout: HEALTHCHECK_TIMEOUT_MS } as NgxFetchOptions)
    r.return(
      200,
      JSON.stringify({
        url,
        status: response.status,
        healthy: response.status >= 200 && response.status < 400,
      } as HealthCheckResponse)
    )
  } catch (e) {
    r.return(
      200,
      JSON.stringify({ url, status: 0, healthy: false, error: (e as Error).message } as HealthCheckResponse)
    )
  }
}

export default {
  handleHealthCheck,
}
