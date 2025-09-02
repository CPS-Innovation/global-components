import handler from "serve-handler";
import { createServer } from "http";
import { URL } from "url";
import { decode } from "./encoding";

const server = createServer((request, response) => {
  console.log(request);
  const parsedUrl = new URL(request.url!, `http://${request.headers.host}`);

  if (parsedUrl.pathname.endsWith("/config.json")) {
    if (!request.headers["x-config"]) {
      response.writeHead(500);
      response.end();
      return;
    }
    const config = decode(request.headers["x-config"] as string);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(config);
  } else {
    // For all other requests, delegate to serve-handler
    return handler(request, response, {
      public: "./harness",
      rewrites: [{ source: "!(*.js|*.json)", destination: "/index.html" }],
    });
  }
});

server.listen(3000, () => {
  console.log("Running at http://localhost:3000");
});
