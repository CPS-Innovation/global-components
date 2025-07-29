# Menu config

The JSON

Menu

- expresses structure of menu
- what is visible - case context or not

Context

- express page we are on
- should link call event or not

```typescript
type Contexts = { contexts: string[]; paths: string[] };

type Link = {
  label: string;
  href: string;
  openInNewTab?: boolean;
  visibleContexts?: string[];
  activeContexts: string[];
  useEventNavigationContext: string;
  children: Link[];
};

type Config = {
  contexts: Contexts[];
  links: Link[];
};
```
