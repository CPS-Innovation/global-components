| File                                                                  | UI layer | Injection layer |
| --------------------------------------------------------------------- | -------- | --------------- |
| global-components.cms-auth-presence.conf/.ts (three script injection rules) | Yes      | No              |
| global-components.cms-auth-presence.conf/.ts (auth rules)                   | No       | Yes             |
| global-components.cms-auth-presence.conf/.ts (presence api rules)           | No       | Yes             |
| cms-augmentation/client-{classic,modern}{,-unstable}.js (built by packages/cps-global-presence) | No | Yes |
