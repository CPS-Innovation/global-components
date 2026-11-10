| File                                                                  | UI layer | Injection layer |
| --------------------------------------------------------------------- | -------- | --------------- |
| global-components.cms-augmentation.conf (four script injection rules) | Yes      | No              |
| global-components.cms-augmentation.conf/.ts (state + diagnostic tail, moving to Polaris) | No | Yes |
| ../global-components.watchdog (presence api rules)                    | No       | Yes             |
| cms-augmentation/client-{classic,modern}{,-unstable}.js (built by packages/cps-global-presence) | No | Yes |
