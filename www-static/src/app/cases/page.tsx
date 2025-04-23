export default function Cases() {
  return (
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
                  <a href="#" className="govuk-link">
                    CPS-2025-0123
                  </a>
                </td>
                <td className="govuk-table__cell">Theft and handling</td>
                <td className="govuk-table__cell">22 April 2025</td>
                <td className="govuk-table__cell">
                  <strong className="govuk-tag">Active</strong>
                </td>
              </tr>
              <tr className="govuk-table__row">
                <td className="govuk-table__cell">
                  <a href="#" className="govuk-link">
                    CPS-2025-0122
                  </a>
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
                  <a href="#" className="govuk-link">
                    CPS-2025-0121
                  </a>
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
              >
                <span className="govuk-pagination__link-title">Previous</span>
              </a>
            </div>
            <ul className="govuk-pagination__list">
              <li className="govuk-pagination__item govuk-pagination__item--current">
                <a
                  className="govuk-link govuk-pagination__link"
                  href="#"
                  aria-current="page"
                >
                  1
                </a>
              </li>
              <li className="govuk-pagination__item">
                <a className="govuk-link govuk-pagination__link" href="#">
                  2
                </a>
              </li>
              <li className="govuk-pagination__item">
                <a className="govuk-link govuk-pagination__link" href="#">
                  3
                </a>
              </li>
            </ul>
            <div className="govuk-pagination__next">
              <a
                className="govuk-link govuk-pagination__link"
                href="#"
                rel="next"
              >
                <span className="govuk-pagination__link-title">Next</span>
              </a>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
