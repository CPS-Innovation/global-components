export default function Help() {
  return (
    <div>
      <h1 className="govuk-heading-xl">Help</h1>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h2 className="govuk-heading-m">Getting started</h2>
          <p className="govuk-body">
            This service allows you to manage and review cases in the Crown
            Prosecution Service digital system.
          </p>

          <h2 className="govuk-heading-m">Contact support</h2>
          <p className="govuk-body">
            If you need help using this service, please contact the CPS Digital
            Support team:
          </p>
          <ul className="govuk-list govuk-list--bullet">
            <li>Email: support@cps.gov.uk</li>
            <li>Phone: 0300 123 4567</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
