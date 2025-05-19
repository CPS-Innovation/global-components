# UK Government Service Static Site

A static site built with Eleventy and GOV.UK Frontend that simulates a UK government service.

## Getting Started

### Prerequisites

- Node.js (v12 or later)
- npm

### Installation

```bash
npm install
```

### Development

To start the development server with live reloading:

```bash
npm start
```

### Build

To build the site for production:

```bash
npm run build
```

The output will be in the `_site` directory.

## Project Structure

- `src/`: Source files
  - `_layouts/`: Layout templates
  - `_includes/`: Reusable components
  - `_data/`: Global data files
  - `assets/`: Static assets
  - `tasks/`: Tasks pages
  - `cases/`: Cases pages and subpages

## Routes

- `/tasks`: A list of tasks for the user to achieve today
- `/cases`: Shows a list of cases with links
- `/cases/urns/:urn/cases/:caseId`: Case details pages
- `/cases/urns/:urn/cases/:caseId/review`: Case review pages
- `/cases/urns/:urn/cases/:caseId/materials`: Case materials pages

## Technologies Used

- [Eleventy](https://www.11ty.dev/) - Static site generator
- [GOV.UK Frontend](https://frontend.design-system.service.gov.uk/) - Design system for UK government services