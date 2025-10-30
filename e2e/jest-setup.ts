import "jest-puppeteer";
import "expect-puppeteer";
import { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer";

// Declare global variables
declare global {
  var browser: Browser;
  var page: Page;
}

if (process.env.LOG === "true") {
  // Buffer for sorting logs
  const logBuffer: Array<{ timestamp: number; message: string }> = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const flushLogs = () => {
    if (logBuffer.length === 0) return;

    // Sort by timestamp
    logBuffer.sort((a, b) => a.timestamp - b.timestamp);

    // Output all buffered logs
    logBuffer.forEach((log) => {
      process.stdout.write(log.message);
    });

    // Clear buffer
    logBuffer.length = 0;
  };

  // Global before each - runs before EVERY test
  beforeEach(async () => {
    const testName = expect.getState().currentTestName || "Unknown Test";
    process.stdout.write(
      `[Test start ${new Date().toISOString()}: ${testName}]\n`
    );

    // Clear buffer at start of each test
    logBuffer.length = 0;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  });

  afterEach(async () => {
    // Flush any remaining logs before test ends
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushLogs();

    const testName = expect.getState().currentTestName || "Unknown Test";
    process.stdout.write(`[Test end: ${testName}]\n`);
  });

  page
    .on("console", async (msg) => {
      const args = await Promise.all(
        msg.args().map((arg) => arg.jsonValue().catch(() => undefined))
      );

      const cleaned = [];
      let extractedTimestamp: number | null = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // Skip undefined values
        if (arg === undefined) continue;

        // Check if this is a timestamp (13-digit number starting with 17)
        if (
          typeof arg === "number" &&
          arg > 1700000000000 &&
          arg < 2000000000000
        ) {
          extractedTimestamp = arg;
        }

        // If this is a %c format string, skip the next argument (CSS styles)
        if (typeof arg === "string" && arg.includes("%c")) {
          // Add the text without %c
          cleaned.push(arg.replace(/%c/g, "").trim());
          // Skip the next argument (CSS styles)
          i++;
        }
        // Skip standalone CSS style strings (they typically contain CSS properties)
        else if (
          typeof arg === "string" &&
          (arg.includes("background-color:") ||
            arg.includes("color:") ||
            arg.includes("font-") ||
            arg.includes("padding:") ||
            arg.includes("border:") ||
            arg.includes("margin:"))
        ) {
          // Skip CSS style strings
          continue;
        } else {
          // Handle normal arguments
          if (typeof arg === "object") {
            cleaned.push(JSON.stringify(arg));
          } else {
            cleaned.push(String(arg));
          }
        }
      }

      const text = cleaned.filter((s) => s).join(" "); // Filter out empty strings

      if (text) {
        // Extract timestamp from the text if we haven't found it yet
        if (!extractedTimestamp) {
          const timestampMatch = text.match(/\b(17\d{11})\b/);
          if (timestampMatch) {
            extractedTimestamp = parseInt(timestampMatch[1], 10);
          }
        }

        const logEntry = {
          timestamp: extractedTimestamp || Date.now(),
          message: `  [Browser ${msg.type()}]: ${text}\n`,
        };

        logBuffer.push(logEntry);

        // Clear any existing timer
        if (flushTimer) clearTimeout(flushTimer);

        // Set new timer to flush after 10ms of no new logs
        flushTimer = setTimeout(flushLogs, 10);
      }
    })
    .on("pageerror", (error) => {
      // Page errors go out immediately as they're usually important
      process.stdout.write(`  [Browser Uncaught Error]: ${error.message}\n`);
    })
    .on("close", () => {
      // Flush logs when page closes
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushLogs();
    });
}
