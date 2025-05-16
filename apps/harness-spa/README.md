# CPS Harness SPA

This is a Single Page Application (SPA) version of the CPS Harness application, built with React and React Router. It provides the same functionality as harness-static but uses client-side routing instead of server-side routing.

## Technologies Used

- React
- React Router
- TypeScript
- Vite
- SASS
- GOV.UK Frontend

## Project Structure

```
harness-spa/
├── public/
│   └── assets/
├── src/
│   ├── components/
│   │   └── Layout.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Tasks.tsx
│   │   ├── Cases.tsx
│   │   ├── CaseDetails.tsx
│   │   ├── Review.tsx
│   │   ├── Help.tsx
│   │   ├── Privacy.tsx
│   │   └── Cookies.tsx
│   ├── styles/
│   │   └── globals.scss
│   ├── types/
│   │   └── cps-global-header.d.ts
│   ├── App.tsx
│   └── main.tsx
├── index.html
└── vite.config.ts
```

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Building

To create a production build:

```bash
npm run build
```

The build output will be in the `dist` directory.

## Features

- Client-side routing with React Router
- GOV.UK Frontend styling
- Responsive layout
- TypeScript support
- Hot Module Replacement (HMR) in development

## Routes

- `/` - Home (redirects to /tasks)
- `/tasks` - Tasks list
- `/cases` - Cases list
- `/cases/urns/:urn/cases/:caseId` - Case details
- `/review` - Review page
- `/help` - Help page
- `/privacy` - Privacy notice
- `/cookies` - Cookie policy
