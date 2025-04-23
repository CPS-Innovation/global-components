import { Metadata } from "next";
import GovUKInit from "./components/GovUKInit";
import "./styles.scss";
import Script from "next/script";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CPS Digital Services",
  description: "Crown Prosecution Service Digital Services",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="govuk-template">
      <head>
        <Script
          src="https://sacpsglobalcomponents.blob.core.windows.net/dev/cps-global-components.js"
          type="module"
        />
      </head>
      <body className="govuk-template__body">
        <cps-global-nav></cps-global-nav>
        <div className="govuk-width-container">
          <main className="govuk-main-wrapper" id="main-content" role="main">
            {children}
          </main>
        </div>
        <footer className="govuk-footer" role="contentinfo">
          <div className="govuk-width-container">
            <div className="govuk-footer__meta">
              <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
                <h2 className="govuk-visually-hidden">Support links</h2>
                <ul className="govuk-footer__inline-list">
                  <li className="govuk-footer__inline-list-item">
                    <Link className="govuk-footer__link" href="/help">
                      Help
                    </Link>
                  </li>
                  <li className="govuk-footer__inline-list-item">
                    <Link className="govuk-footer__link" href="/privacy">
                      Privacy
                    </Link>
                  </li>
                  <li className="govuk-footer__inline-list-item">
                    <Link className="govuk-footer__link" href="/cookies">
                      Cookies
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </footer>
        <GovUKInit />
      </body>
    </html>
  );
}
