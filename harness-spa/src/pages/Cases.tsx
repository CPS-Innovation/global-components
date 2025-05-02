import React, { useState } from "react";
import { Link } from "react-router-dom";

const Cases: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <main>
      <div>
        <h1 className="govuk-heading-xl">Cases</h1>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="case-search">
                Search cases
              </label>
              <input
                className="govuk-input govuk-input--width-20"
                id="case-search"
                name="case-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <table className="govuk-table">
              <caption className="govuk-table__caption govuk-table__caption--m">
                Recent cases
              </caption>
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">
                    Case reference
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Description
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Last updated
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                <tr className="govuk-table__row">
                  <td className="govuk-table__cell">
                    <Link
                      to="/cases/urns/12AB1212121/cases/100001"
                      className="govuk-link"
                    >
                      12AB1212121/100001
                    </Link>
                  </td>
                  <td className="govuk-table__cell">Theft and handling</td>
                  <td className="govuk-table__cell">22 April 2025</td>
                  <td className="govuk-table__cell">
                    <strong className="govuk-tag">Active</strong>
                  </td>
                </tr>
                <tr className="govuk-table__row">
                  <td className="govuk-table__cell">
                    <Link
                      to="/cases/urns/12AB1212121/cases/100002"
                      className="govuk-link"
                    >
                      12AB1212121/100002
                    </Link>
                  </td>
                  <td className="govuk-table__cell">Public order offence</td>
                  <td className="govuk-table__cell">21 April 2025</td>
                  <td className="govuk-table__cell">
                    <strong className="govuk-tag govuk-tag--yellow">
                      Under Review
                    </strong>
                  </td>
                </tr>
                <tr className="govuk-table__row">
                  <td className="govuk-table__cell">
                    <Link
                      to="/cases/urns/12AB3333333/cases/100003"
                      className="govuk-link"
                    >
                      12AB3333333/100003
                    </Link>
                  </td>
                  <td className="govuk-table__cell">Criminal damage</td>
                  <td className="govuk-table__cell">20 April 2025</td>
                  <td className="govuk-table__cell">
                    <strong className="govuk-tag govuk-tag--green">
                      Complete
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>

            <nav
              className="govuk-pagination"
              role="navigation"
              aria-label="results"
            >
              <div className="govuk-pagination__prev">
                <a
                  className="govuk-link govuk-pagination__link"
                  href="#"
                  rel="prev"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                >
                  <svg
                    className="govuk-pagination__icon govuk-pagination__icon--prev"
                    xmlns="http://www.w3.org/2000/svg"
                    height="13"
                    width="15"
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 15 13"
                  >
                    <path d="m6.5938-0.0078125-6.7266 6.7266 6.7441 6.4062 1.377-1.449-4.1856-3.9768h12.896v-2h-12.984l4.2931-4.293-1.414-1.414z"></path>
                  </svg>
                  <span className="govuk-pagination__link-title">Previous</span>
                </a>
              </div>
              <ul className="govuk-pagination__list">
                {[1, 2, 3].map((page) => (
                  <li
                    key={page}
                    className={`govuk-pagination__item ${
                      currentPage === page
                        ? "govuk-pagination__item--current"
                        : ""
                    }`}
                  >
                    <a
                      className="govuk-link govuk-pagination__link"
                      href="#"
                      aria-label={`Page ${page}`}
                      aria-current={currentPage === page ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(page);
                      }}
                    >
                      {page}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="govuk-pagination__next">
                <a
                  className="govuk-link govuk-pagination__link"
                  href="#"
                  rel="next"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < 3) setCurrentPage(currentPage + 1);
                  }}
                >
                  <span className="govuk-pagination__link-title">Next</span>
                  <svg
                    className="govuk-pagination__icon govuk-pagination__icon--next"
                    xmlns="http://www.w3.org/2000/svg"
                    height="13"
                    width="15"
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 15 13"
                  >
                    <path d="m8.107-0.0078125-1.4136 1.414 4.2926 4.293h-12.986v2h12.896l-4.1855 3.9766 1.377 1.4492 6.7441-6.4062-6.7246-6.7266z"></path>
                  </svg>
                </a>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Cases;
