export default function Cookies() {
  return (
    <div>
      <h1 className="govuk-heading-xl">Cookies</h1>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <p className="govuk-body">
            Cookies are small files saved on your phone, tablet or computer when
            you visit a website.
          </p>

          <h2 className="govuk-heading-m">Essential cookies</h2>
          <p className="govuk-body">
            We use essential cookies to make our digital services work. These
            cookies:
          </p>
          <ul className="govuk-list govuk-list--bullet">
            <li>Remember your progress through forms</li>
            <li>Keep you signed in during your visit</li>
            <li>Make sure you can access all parts of the website</li>
          </ul>

          <h2 className="govuk-heading-m">Analytics cookies (optional)</h2>
          <p className="govuk-body">
            With your permission, we use Google Analytics to collect data about
            how you use our digital services. This information helps us to:
          </p>
          <ul className="govuk-list govuk-list--bullet">
            <li>Improve our digital services</li>
            <li>Make sure they work on different devices and browsers</li>
            <li>Understand how we can make them better</li>
          </ul>

          <h2 className="govuk-heading-m">Change your cookie settings</h2>
          <p className="govuk-body">
            You can choose which cookies you&apos;re happy for us to use.
          </p>
          <button className="govuk-button" data-module="govuk-button">
            Cookie settings
          </button>
        </div>
      </div>
    </div>
  );
}
