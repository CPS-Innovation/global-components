import Link from "next/link";

export function generateStaticParams() {
  return [
    { urn: "12AB1212121", caseId: "100001" },
    { urn: "12AB1212121", caseId: "100002" },
    { urn: "12AB3333333", caseId: "100003" },
  ];
}

export default async function CaseReview({
  params,
}: {
  params: Promise<{ urn: string; caseId: string }>;
}) {
  const { urn, caseId } = await params;
  return (
    <div>
      <h1 className="govuk-heading-xl">Case Review</h1>
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

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="review-notes">
              Review Notes
            </label>
            <textarea
              className="govuk-textarea"
              id="review-notes"
              name="review-notes"
              rows={5}
            ></textarea>
          </div>

          <div className="govuk-button-group">
            <Link
              prefetch={false}
              href={`/cases/urns/${urn}/cases/${caseId}`}
              className="govuk-button govuk-button--secondary"
            >
              Back to Case
            </Link>
            <Link
              prefetch={false}
              href={`/cases/urns/${urn}/cases/${caseId}/materials`}
              className="govuk-button"
            >
              View Materials
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
