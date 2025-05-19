- We want to build a static site using the `@11ty/eleventy` package.
- We are doing this so that we can compile, deploy and serve a site that is just static html, css, images, etc files. Navigation between the pages of the site must be traditional full-page browser navigation.
- The site will simulate a UK government site using GDS styling using the `govuk-frontend` package.
- We will generate some plausible dummy content using GDS styles.
- The pages will follow the navigation structure in the table below.

| Route                                    | Notes                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| /tasks                                   | A list of tasks for the user to achieve today                                                                                           |
| /cases                                   | Shows a list of cases with links pointing to cases with urn/caseId values of 12AB1212121/100001; 12AB1212121/100002; 12AB3333333/100003 |
| /cases/urns/:urn/cases/:caseId           | For each urn/caseId combo create a details page at this route                                                                           |
| /cases/urns/:urn/cases/:caseId/review    | For each urn/caseId combo move the review page to this route                                                                            |
| /cases/urns/:urn/cases/:caseId/materials | For each urn/caseId combo create a materials page at this route                                                                         |
