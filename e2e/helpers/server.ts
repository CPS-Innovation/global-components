import handler from "serve-handler"
import { createServer } from "http"
import { URL } from "url"
import { decode } from "./encoding"
import { constants as C } from "./constants"

const server = createServer((request, response) => {
  const parsedUrl = new URL(request.url!, `http://${request.headers.host}`)

  if (parsedUrl.pathname.endsWith("/config.json")) {
    if (!request.headers["x-config"]) {
      response.writeHead(500)
      response.end()
      return
    }
    const config = decode(request.headers["x-config"] as string)
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(config)
  } else if (parsedUrl.pathname.startsWith(C.GATEWAY_URL)) {
    const caseSummaryMatch = parsedUrl.pathname.match(
      /\/cases\/(\d+)\/summary$/
    )

    if (request.method === "GET" && caseSummaryMatch) {
      const caseId = parseInt(caseSummaryMatch[1], 10)
      const responseBody = {
        id: caseId,
        urn: `${C.URN_PREFIX}${caseId}`,
        isDcfCase: caseId % 2 === 0,
      }
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify(responseBody))
      return
    }

    // Unhandled API route
    response.writeHead(404)
    response.end()
  } else {
    // For all other requests, delegate to serve-handler
    return handler(request, response, {
      public: "./harness",
      rewrites: [{ source: "!(*.js|*.json)", destination: "/index.html" }],
    })
  }
})

server.listen(3000, () => {
  console.log("Running at http://localhost:3000")
})
