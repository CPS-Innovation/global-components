import Link from "next/link";

export function generateStaticParams() {
  return [
    { urn: "12AB1212121", caseId: "100001" },
    { urn: "12AB1212121", caseId: "100002" },
    { urn: "12AB3333333", caseId: "100003" },
  ];
}

export default async function CaseDetails({
  params,
}: {
  params: Promise<{ urn: string; caseId: string }>;
}) {
  const { urn, caseId } = await params;
  return (
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
              prefetch={false}
              href={`/cases/urns/${urn}/cases/${caseId}/review`}
              className="govuk-button"
            >
              Review Case
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
