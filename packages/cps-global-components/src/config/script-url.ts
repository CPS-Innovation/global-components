// It is impossible to mock `import.meta.url` so we extract it to
//  a helper file to enable to caller's tests to mock this out.
export const scriptUrl = () => import.meta.url;
