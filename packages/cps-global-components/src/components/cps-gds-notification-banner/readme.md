# cps-gds-notification-banner



<!-- Auto Generated Below -->


## Overview

A thin shell over govuk-frontend's notification banner.

Deliberately thin. The pinned variant that used to live here as a flag is now
cps-global-pinned-notification: it positions against the viewport, mutates the
host page's layout and follows UCD's design, none of which belongs in the
component every notification in the app renders through.

## Properties

| Property            | Attribute             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Type                     | Default     |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------- |
| `disableAutoFocus`  | `disable-auto-focus`  | Prevent the banner from being focused on page load (only relevant for success type).                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `boolean`                | `false`     |
| `dismissible`       | `dismissible`         | Renders the dismiss button. Persistence is the caller's responsibility via the `cpsDismissed` event.                                                                                                                                                                                                                                                                                                                                                                                                                                   | `boolean`                | `false`     |
| `role`              | `role`                | Override the ARIA role. Defaults to "region" (or "alert" for success type).                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `string \| undefined`    | `undefined` |
| `titleHeadingLevel` | `title-heading-level` | The heading level for the title (1-6). Defaults to 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `number`                 | `2`         |
| `titleId`           | `title-id`            | Custom id for the title element. Defaults to one generated per instance.  NOT A FIXED STRING, which is what GDS's own example markup uses and what this defaulted to. aria-labelledby is an IDREF and resolves to the FIRST matching element in the tree, so several banners sharing an id all end up named by whichever renders first — and cps-global-notifications renders one banner per notification, all as siblings. The symptom is a screen reader announcing the same region name several times over, on the busiest screens. | `string \| undefined`    | `undefined` |
| `titleText`         | `title-text`          | The title text shown in the banner header. Defaults to "Important" or "Success" based on type.                                                                                                                                                                                                                                                                                                                                                                                                                                         | `string \| undefined`    | `undefined` |
| `type`              | `type`                | Set to "success" for the green success variant. Omit for the default (information) variant.                                                                                                                                                                                                                                                                                                                                                                                                                                            | `"success" \| undefined` | `undefined` |


## Events

| Event          | Description                                    | Type                |
| -------------- | ---------------------------------------------- | ------------------- |
| `cpsDismissed` | Fired when the user clicks the dismiss button. | `CustomEvent<void>` |


## Dependencies

### Used by

 - [cps-global-home-page-notification](../cps-global-home-page-notification)
 - [cps-global-notifications](../cps-global-notifications)

### Graph
```mermaid
graph TD;
  cps-global-home-page-notification --> cps-gds-notification-banner
  cps-global-notifications --> cps-gds-notification-banner
  style cps-gds-notification-banner fill:#f9f,stroke:#333,stroke-width:4px
```

----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
