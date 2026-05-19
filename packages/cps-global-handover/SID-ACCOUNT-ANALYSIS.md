Align active account with sid

|                | 1. no sid                       | 2. known sid (matches an account)                           | 3. unknown sid                 |
| -------------- | ------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| no accounts    | No token call; login (no hint); | No token call; login (sid hint);                            | No token call; login(sid hint) |
| account active | Token call; login (no hint);    | Ensure active acc matches sid;Token call; login (sid hint); | No token call; login(sid hint) |

We call reconcile-active-account-and-sid.ts at the start of every flow. If a known account does not match the sid then we clear the active account.
We proceed with the incoming sid, of if thee is not one, then the sid of the active account.
We gate acquireTokenSilent on there being an active account, otherwise we call it with no hint (which will use the active account).
login is called with the sid, so will match the active the intention of the incoming sid, otherwise defaults to the active account's sid if there was no incoming sid.
