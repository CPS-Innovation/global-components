# cps-global-header

<!-- Auto Generated Below -->


## Properties

| Property | Attribute | Description                                       | Type     | Default            |
| -------- | --------- | ------------------------------------------------- | -------- | ------------------ |
| `name`   | `name`    | The text to appear at the start of the second row | `string` | `"Please wait..."` |


## Dependencies

### Depends on

- [nav-link](internal)
- [drop-down](internal)

### Graph
```mermaid
graph TD;
  cps-global-header --> nav-link
  cps-global-header --> drop-down
  drop-down --> nav-link
  style cps-global-header fill:#f9f,stroke:#333,stroke-width:4px
```

----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
