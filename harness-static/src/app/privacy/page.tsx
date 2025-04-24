export default function Privacy() {
  return (
    <div>
      <h1 className="govuk-heading-xl">Privacy notice</h1>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <p className="govuk-body">
            The Crown Prosecution Service (CPS) is committed to protecting your
            personal data in accordance with the Data Protection Act 2018 and
            the UK General Data Protection Regulation (UK GDPR).
          </p>

          <h2 className="govuk-heading-m">How we use your data</h2>
          <p className="govuk-body">
            We collect and process personal data that is necessary for the
            performance of our official functions as a government department.
          </p>

          <h2 className="govuk-heading-m">Your rights</h2>
          <p className="govuk-body">
            Under data protection law, you have rights including:
          </p>
          <ul className="govuk-list govuk-list--bullet">
            <li>Your right of access</li>
            <li>Your right to rectification</li>
            <li>Your right to erasure</li>
            <li>Your right to restrict processing</li>
            <li>Your right to object to processing</li>
            <li>Your right to data portability</li>
          </ul>

          <h2 className="govuk-heading-m">Contact us</h2>
          <p className="govuk-body">
            If you have any questions about this privacy notice or how we handle
            your personal information, please contact our Data Protection
            Officer:
          </p>
          <p className="govuk-body">Email: data.protection@cps.gov.uk</p>
        </div>
      </div>
    </div>
  );
}
