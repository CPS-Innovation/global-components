## Create a layout block

- Layouts
  - `LayoutCPS` block
    - HTML element `cps-global-header`
    - Placeholder (MainContent)
    - HTML element `cps-global-footer`

## `OnInitialize`

Add the code in `layout.on-initialise.js` to a JavaScript block in the `OnInitialize` event handler for LayoutCPS`

## `Stylesheet`

Add the css in `layout.stylesheet.css` to the `Style Sheet` property of `LayoutCPS`

## General styling

These are not required for the global components themselves but are used to make a pleasant looking test harness:

### Download the compiled GDS assets

- As per the instructions [here](https://frontend.design-system.service.gov.uk/), which lead [here](https://frontend.design-system.service.gov.uk/install-using-precompiled-files/), then (at the time of writing) on to [here](https://github.com/alphagov/govuk-frontend/releases/tag/v5.10.0), download the compiled files from [here](https://github.com/alphagov/govuk-frontend/releases/download/v5.10.0/release-v5.10.0.zip).

- In `govuk-frontend-5.10.0.min.css` do a string replace on `/assets/fonts/` to change to `/{your-outsystems-app-name}/` e.g. `/Steftest/`.

- Upload this file to the root of the `Data` tab -> `Resources` folder of the test harness app.

- Upload the files in `assets/fonts/` to the same toot `Resources` folder.
