# Embedding global components in OutSystems

## Web components

Add a reference to the global components script.

| Environment | Path                                                                                |
| ----------- | ----------------------------------------------------------------------------------- |
| `cps-dev`   | `https://sacpsglobalcomponents.blob.core.windows.net/dev/cps-global-components.js`  |
| `cps-tst`   | `https://sacpsglobalcomponents.blob.core.windows.net/test/cps-global-components.js` |
| `cps`       | `https://sacpsglobalcomponents.blob.core.windows.net/prod/cps-global-components.js` |

Add the `<cps-global-header></cps-global-header>` HTML tag to the appropriate block.

## Content Security Policy directives

| Directive type | Path                                                          | Reason                                    |
| -------------- | ------------------------------------------------------------- | ----------------------------------------- |
| script-src     | `sacpsglobalcomponents.blob.core.windows.net`                 | Retrieve global components script         |
| connect-src    | `sacpsglobalcomponents.blob.core.windows.net`                 | Retrieve environment-specific config file |
| connect-src    | `https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json` | App Insights analytics                    |
| connect-src    | `https://uksouth-1.in.applicationinsights.azure.com/v2/track` | App Insights analytics                    |

## Auth handover

- Create an `AuthHandover` module in the dev, test and prod environments.

- Create an `auth-handover.html` document specific to each environment with content as follows:

```html
<!-- in dev -->
<html>
  <script src="https://sacpsglobalcomponents.blob.core.windows.net/dev/auth-handover.js"></script>
</html>

<!-- in test -->
<html>
  <script src="https://sacpsglobalcomponents.blob.core.windows.net/test/auth-handover.js"></script>
</html>

<!-- in prod -->
<html>
  <script src="https://sacpsglobalcomponents.blob.core.windows.net/prod/auth-handover.js"></script>
</html>
```

- Upload the `auth-handover.html` document to `Data` -> `Resources`.

- Edit the properties of the document so that `Public: Yes` and `Deploy Action: Deploy to Target Directory`

- Publish the changes.

### Local storage keys

The auth handover mechanism populates the local storage properties defined in [`handover.ts`](../packages/cps-global-os-handover//src/handover.ts).
