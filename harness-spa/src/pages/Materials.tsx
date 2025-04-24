import React from "react";
import { Link, useParams } from "react-router-dom";

const Materials: React.FC = () => {
  const { urn, caseId } = useParams<{ urn: string; caseId: string }>();

  return (
    <div>
      <h1 className="govuk-heading-xl">Case Materials</h1>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">URN</dt>
              <dd className="govuk-summary-list__value">{urn}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Case ID</dt>
              <dd className="govuk-summary-list__value">{caseId}</dd>
            </div>
          </dl>

          <table className="govuk-table">
            <caption className="govuk-table__caption govuk-table__caption--m">
              Case Materials
            </caption>
            <thead className="govuk-table__head">
              <tr className="govuk-table__row">
                <th scope="col" className="govuk-table__header">
                  Document
                </th>
                <th scope="col" className="govuk-table__header">
                  Type
                </th>
                <th scope="col" className="govuk-table__header">
                  Added
                </th>
              </tr>
            </thead>
            <tbody className="govuk-table__body">
              <tr className="govuk-table__row">
                <td className="govuk-table__cell">
                  <img
                    src="/spa-app/file.svg"
                    alt="Document"
                    width={20}
                    height={20}
                    className="govuk-!-margin-right-2"
                    style={{ verticalAlign: "middle" }}
                  />
                  <Link to="#" className="govuk-link">
                    Witness Statement
                  </Link>
                </td>
                <td className="govuk-table__cell">PDF</td>
                <td className="govuk-table__cell">22 April 2025</td>
              </tr>
              <tr className="govuk-table__row">
                <td className="govuk-table__cell">
                  <img
                    src="/spa-app/file.svg"
                    alt="Document"
                    width={20}
                    height={20}
                    className="govuk-!-margin-right-2"
                    style={{ verticalAlign: "middle" }}
                  />
                  <Link to="#" className="govuk-link">
                    Police Report
                  </Link>
                </td>
                <td className="govuk-table__cell">PDF</td>
                <td className="govuk-table__cell">21 April 2025</td>
              </tr>
            </tbody>
          </table>

          <div className="govuk-button-group">
            <Link
              to={`/cases/urns/${urn}/cases/${caseId}`}
              className="govuk-button govuk-button--secondary"
            >
              Back to Case
            </Link>
            <Link
              to={`/cases/urns/${urn}/cases/${caseId}/review`}
              className="govuk-button"
            >
              Review Case
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Materials;
