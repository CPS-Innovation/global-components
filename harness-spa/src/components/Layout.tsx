import React from "react";
import { Link } from "react-router-dom";

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <div className="govuk-width-container">
        <cps-global-nav></cps-global-nav>
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
                  <Link className="govuk-footer__link" to="/help">
                    Help
                  </Link>
                </li>
                <li className="govuk-footer__inline-list-item">
                  <Link className="govuk-footer__link" to="/privacy">
                    Privacy
                  </Link>
                </li>
                <li className="govuk-footer__inline-list-item">
                  <Link className="govuk-footer__link" to="/cookies">
                    Cookies
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Layout;
