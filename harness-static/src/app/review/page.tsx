import Link from "next/link";

export default function Review() {
  return (
    <div>
      <h1 className="govuk-heading-xl">Review</h1>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-tabs" data-module="govuk-tabs">
            <h2 className="govuk-tabs__title">Contents</h2>
            <ul className="govuk-tabs__list">
              <li className="govuk-tabs__list-item govuk-tabs__list-item--selected">
                <Link className="govuk-tabs__tab" href="/review?tab=pending">
                  Pending Review (3)
                </Link>
              </li>
              <li className="govuk-tabs__list-item">
                <Link className="govuk-tabs__tab" href="/review?tab=completed">
                  Completed
                </Link>
              </li>
            </ul>

            <div className="govuk-tabs__panel" id="pending">
              <h2 className="govuk-heading-l">Items Pending Review</h2>

              <div className="govuk-accordion" data-module="govuk-accordion">
                <div className="govuk-accordion__section">
                  <div className="govuk-accordion__section-header">
                    <h2 className="govuk-accordion__section-heading">
                      <span className="govuk-accordion__section-button">
                        Case Update: CPS-2025-0123
                      </span>
                    </h2>
                  </div>
                  <div className="govuk-accordion__section-content">
                    <p className="govuk-body">
                      Updated case details requiring review and approval.
                    </p>
                    <Link
                      href="/review/case/CPS-2025-0123"
                      className="govuk-button"
                    >
                      Review Changes
                    </Link>
                  </div>
                </div>

                <div className="govuk-accordion__section">
                  <div className="govuk-accordion__section-header">
                    <h2 className="govuk-accordion__section-heading">
                      <span className="govuk-accordion__section-button">
                        Document Review: Witness Statement
                      </span>
                    </h2>
                  </div>
                  <div className="govuk-accordion__section-content">
                    <p className="govuk-body">
                      New witness statement added to case CPS-2025-0122.
                    </p>
                    <Link
                      href="/review/document/CPS-2025-0122"
                      className="govuk-button"
                    >
                      Review Document
                    </Link>
                  </div>
                </div>

                <div className="govuk-accordion__section">
                  <div className="govuk-accordion__section-header">
                    <h2 className="govuk-accordion__section-heading">
                      <span className="govuk-accordion__section-button">
                        Status Change Request
                      </span>
                    </h2>
                  </div>
                  <div className="govuk-accordion__section-content">
                    <p className="govuk-body">
                      Request to change case status to &quot;Ready for
                      Court&quot;.
                    </p>
                    <Link
                      href="/review/status/CPS-2025-0122"
                      className="govuk-button"
                    >
                      Review Request
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="govuk-tabs__panel govuk-tabs__panel--hidden"
              id="completed"
            >
              <h2 className="govuk-heading-l">Completed Reviews</h2>
              <table className="govuk-table">
                <thead className="govuk-table__head">
                  <tr className="govuk-table__row">
                    <th scope="col" className="govuk-table__header">
                      Item
                    </th>
                    <th scope="col" className="govuk-table__header">
                      Reviewed Date
                    </th>
                    <th scope="col" className="govuk-table__header">
                      Decision
                    </th>
                  </tr>
                </thead>
                <tbody className="govuk-table__body">
                  <tr className="govuk-table__row">
                    <td className="govuk-table__cell">
                      Evidence Review: CCTV Footage
                    </td>
                    <td className="govuk-table__cell">21 April 2025</td>
                    <td className="govuk-table__cell">
                      <strong className="govuk-tag govuk-tag--green">
                        Approved
                      </strong>
                    </td>
                  </tr>
                  <tr className="govuk-table__row">
                    <td className="govuk-table__cell">Case Transfer Request</td>
                    <td className="govuk-table__cell">20 April 2025</td>
                    <td className="govuk-table__cell">
                      <strong className="govuk-tag govuk-tag--red">
                        Rejected
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
