pnpm --filter cps-global-configuration build
pnpm --filter cps-global-components build 
pnpm --filter cps-global-components rollup --intro 'window.cps_global_components_build = window.cps_global_components_build || {Sha: "local", RunId: 0, Timestamp: "2000-01-01T00:00:00Z"};' 
cp -r ./packages/cps-global-components/dist/cps-global-components.js ./apps/harness-spa/public/assets/ 
pnpm --filter harness-spa dev