import * as signalR from "@microsoft/signalr";

const log = (...args) => console.log("[case-locking-poc]", ...args);
const err = (...args) => console.error("[case-locking-poc]", ...args);

const username = `${location.hostname}-${crypto.randomUUID().slice(0, 6)}`;

const connection = new signalR.HubConnectionBuilder()
  .withUrl(
    "https://polaris-qa-notprod.cps.gov.uk/global-components/case-locking/api/section-view",
    {
      transport:
        signalR.HttpTransportType.ServerSentEvents |
        signalR.HttpTransportType.LongPolling,
    },
  )
  .configureLogging(signalR.LogLevel.Information)
  .build();

let lastLoggedUsers = "";
connection.on("Notify", (users) => {
  const formatted = users.map((u) => `${u.user} (${u.appName})`).join(", ");
  if (formatted === lastLoggedUsers) {
    return;
  }
  lastLoggedUsers = formatted;
  log("active users:", formatted);
});

connection.onclose((error) => {
  err("connection closed", error);
});

connection
  .start()
  .then(() => {
    log(
      "connected, transport:",
      connection.connection?.transport?.constructor?.name ?? "unknown",
    );
    return connection.invoke("Connect", "demo-section", username, "PoC Client");
  })
  .then(() => log("Connect invocation acknowledged"))
  .catch((error) => err("start/invoke failed", error));
