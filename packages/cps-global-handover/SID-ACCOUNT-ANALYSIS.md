Align active account with sid

|                | 1. no sid                       | 2. known sid (matches an account)                           | 3. unknown sid                 |
| -------------- | ------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| no accounts    | No token call; login (no hint); | No token call; login (sid hint);                            | No token call; login(sid hint) |
| account active | Token call; login (no hint);    | Ensure active acc matches sid;Token call; login (sid hint); | No token call; login(sid hint) |

Align active account to sid (or nullify) => Get Token => login(sid)

No account = No token; login (sid hint | null)
Have accounts =
