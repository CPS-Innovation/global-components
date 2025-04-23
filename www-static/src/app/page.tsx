export default function Home() {
  return (
    <div>
      <h1 className="govuk-heading-xl">Welcome to CPS Digital Services</h1>
      <p className="govuk-body">
        Select a service from the navigation menu above to begin.
      </p>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-one-third">
          <div className="govuk-card">
            <h2 className="govuk-heading-m">
              <a href="/tasks" className="govuk-link">
                Tasks
              </a>
            </h2>
            <p className="govuk-body">View and manage your assigned tasks</p>
          </div>
        </div>

        <div className="govuk-grid-column-one-third">
          <div className="govuk-card">
            <h2 className="govuk-heading-m">
              <a href="/cases" className="govuk-link">
                Cases
              </a>
            </h2>
            <p className="govuk-body">Access and review case information</p>
          </div>
        </div>

        <div className="govuk-grid-column-one-third">
          <div className="govuk-card">
            <h2 className="govuk-heading-m">
              <a href="/review" className="govuk-link">
                Review
              </a>
            </h2>
            <p className="govuk-body">Review and approve pending items</p>
          </div>
        </div>
      </div>
    </div>
  );
}
