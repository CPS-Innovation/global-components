import Link from "next/link";
import Image from "next/image";

export function generateStaticParams() {
  return [
    { urn: "12AB1212121", caseId: "100001" },
    { urn: "12AB1212121", caseId: "100002" },
    { urn: "12AB3333333", caseId: "100003" },
  ];
}

export default async function CaseMaterials({
  params,
}: {
  params: Promise<{ urn: string; caseId: string }>;
}) {
  const { urn, caseId } = await params;
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
                  <Image
                    src="/file.svg"
                    alt="Document"
                    width={20}
                    height={20}
                    className="govuk-!-margin-right-2"
                  />
                  <Link href="#" className="govuk-link">
                    Witness Statement
                  </Link>
                </td>
                <td className="govuk-table__cell">PDF</td>
                <td className="govuk-table__cell">22 April 2025</td>
              </tr>
              <tr className="govuk-table__row">
                <td className="govuk-table__cell">
                  <Image
                    src="/file.svg"
                    alt="Document"
                    width={20}
                    height={20}
                    className="govuk-!-margin-right-2"
                  />
                  <Link href="#" className="govuk-link">
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
              href={`/cases/urns/${urn}/cases/${caseId}`}
              className="govuk-button govuk-button--secondary"
            >
              Back to Case
            </Link>
            <Link
              href={`/cases/urns/${urn}/cases/${caseId}/review`}
              className="govuk-button"
            >
              Review Case
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
