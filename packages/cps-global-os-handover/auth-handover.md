# Pages

| Page          | Url                                                                                               | Auth JSON                                         | Cookies                                        |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Task list     | https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList                               | $OS_Users$WorkManagementApp$ClientVars$JSONString | $OS_Users$WorkManagementApp$ClientVars$Cookies |
| Cases         | https://cps-dev.outsystemsenterprise.com/WorkManagementApp/Cases?IsCasesNavigation=true           | $OS_Users$WorkManagementApp$ClientVars$JSONString | $OS_Users$WorkManagementApp$ClientVars$Cookies |
| Case details  | https://cps-dev.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId={caseId}&URN={urn} | $OS_Users$WorkManagementApp$ClientVars$JSONString | $OS_Users$WorkManagementApp$ClientVars$Cookies |
| Case Review   | https://cps-dev.outsystemsenterprise.com/CaseReview/LandingPage?CMSCaseId={caseId}&URN={urn}      | $OS_Users$CaseReview$ClientVars$CmsAuthValues     | $OS_Users$CaseReview$ClientVars$Cookies        |
| Materials     | https://polaris-qa-notprod.cps.gov.uk/polaris-ui/case-details/{urn}/{caseId}                      |                                                   |                                                |
| -             | -                                                                                                 | -                                                 | -                                              |
| Auth handover | https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html                                  |

# OS flow

| Stage                      | Url                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| + Handover outbound        | `https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=enc(URL)&stage=os-outbound`                                                                                                     |
| CMS cookie handover        | `https://cin3.cps.gov.uk/polaris?r=enc(https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=enc(URL)&stage=os-cookie-return)`                                                         |
| Polaris cookies inbound    | `https://polaris-qa-notprod.cps.gov.uk?r=enc(https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=enc(URL)&stage=os-cookie-return)&cookie=(... cookies ...)`                          |
| + Handover cookies inbound | `https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=enc(URL)&stage=os-cookie-return&cc=(... cookies ...)`                                                                           |
| -                          | Potential early exit if cookies match existing storage ones then go to `URL`                                                                                                                        |
| Polaris token lookup       | `https://polaris-qa-notprod.cps.gov.uk/auth-refresh-cms-modern-token?r=enc(https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=enc(URL)&stage=os-token-return)&cc=(... cookies ...)` |
| + Handover cookies inbound | `https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=enc(URL)&stage=os-token-return&cc=(... cookies ...)&cms-modern-token=(... token ...)`                                           |
| -                          | Set local storage values                                                                                                                                                                            |
| Target                     | `URL`                                                                                                                                                                                               |
