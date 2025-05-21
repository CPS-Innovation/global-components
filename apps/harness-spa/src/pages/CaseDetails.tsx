import React from "react";
import { Link, useParams } from "react-router-dom";

const CaseDetails: React.FC = () => {
  const { urn, caseId } = useParams<{ urn: string; caseId: string }>();

  return (
    <main>
      <div>
        <h1 className="govuk-heading-xl">Case Details</h1>
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

            <div className="govuk-button-group">
              <Link
                to={`/cases/urns/${urn}/cases/${caseId}/review`}
                className="govuk-button"
              >
                Review Case
              </Link>
              <Link
                to={`/cases/urns/${urn}/cases/${caseId}/materials`}
                className="govuk-button"
              >
                View Materials
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default CaseDetails;
