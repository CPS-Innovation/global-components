"use client";

import Script from "next/script";

export default function GovUKInit() {
  return (
    <Script
      src="/static-app/govuk/govuk-frontend.min.js"
      strategy="afterInteractive"
      type="module"
      crossOrigin="anonymous"
      onLoad={() => {
        // @ts-expect-error Window GOVUKFrontend initialization
        window.GOVUKFrontend?.initAll();
      }}
    />
  );
}
