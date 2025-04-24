Cache-Control: max-age=1, stale-while-revalidate=3600, stale-if-error=3600

saglobalcomponents

# Deployment

## Setup

- sacpsglobalcomponents.blob.core.windows.net in `SUBSCRIPTION_NAME` subscription

- enable anonymous access

- enable wildcard `CORS` access

- use `az` cli

```bash
az login
az account list --refresh
az account set --subscription "SUBSCRIPTION_NAME"
```

## Publish

`npm run publish`

## Typings

```typescript
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        ["cps-global-nav"]: React.DetailedHTMLProps<
          React.HTMLAttributes<HTMLElement>,
          HTMLElement
        >;
      }
    }
  }
}
```
