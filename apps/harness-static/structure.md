Whilst retaining the basepath of /static-app in the next config, make changes to the pages so we have the following route structure

| Route                                    | Notes                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| /tasks                                   | Leave this as is                                                                                                                      |
| /cases                                   | Change this so the list of cases points to cases with urn/caseId values of 12AB1212121/100001; 12AB1212121/100002; 12AB3333333/100003 |
| /cases/urns/:urn/cases/:caseId           | For each urn/caseId combo create a details page at this route                                                                         |
| /cases/urns/:urn/cases/:caseId/review    | For each urn/caseId combo move the review page to this route                                                                          |
| /cases/urns/:urn/cases/:caseId/materials | For each urn/caseId combo create a materials page at this route                                                                       |

There should be a redirect from the /static-app route to the /tasks route.
