import React from "react";

const Tasks: React.FC = () => {
  return (
    <main>
      <div>
        <h1 className="govuk-heading-xl">Tasks</h1>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <div
              className="govuk-notification-banner"
              role="region"
              aria-labelledby="govuk-notification-banner-title"
            >
              <div className="govuk-notification-banner__header">
                <h2
                  className="govuk-notification-banner__title"
                  id="govuk-notification-banner-title"
                >
                  Important
                </h2>
              </div>
              <div className="govuk-notification-banner__content">
                <p className="govuk-notification-banner__heading">
                  You have 3 tasks requiring attention
                </p>
              </div>
            </div>

            <table className="govuk-table">
              <caption className="govuk-table__caption govuk-table__caption--m">
                Your assigned tasks
              </caption>
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">
                    Task
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Due date
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                <tr className="govuk-table__row">
                  <td className="govuk-table__cell">Review case documents</td>
                  <td className="govuk-table__cell">23 April 2025</td>
                  <td className="govuk-table__cell">
                    <strong className="govuk-tag govuk-tag--red">Urgent</strong>
                  </td>
                </tr>
                <tr className="govuk-table__row">
                  <td className="govuk-table__cell">Update case status</td>
                  <td className="govuk-table__cell">24 April 2025</td>
                  <td className="govuk-table__cell">
                    <strong className="govuk-tag govuk-tag--blue">
                      In Progress
                    </strong>
                  </td>
                </tr>
                <tr className="govuk-table__row">
                  <td className="govuk-table__cell">Submit report</td>
                  <td className="govuk-table__cell">25 April 2025</td>
                  <td className="govuk-table__cell">
                    <strong className="govuk-tag govuk-tag--grey">
                      Not Started
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Tasks;
