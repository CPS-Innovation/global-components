"use client";

import Script from "next/script";

export default function GovUKInit() {
  return (
    <Script
      src="/govuk/govuk-frontend.min.js"
      strategy="afterInteractive"
      onLoad={() => {
        // @ts-expect-error Window GOVUKFrontend initialization
        window.GOVUKFrontend?.initAll();
      }}
    />
  );
}
