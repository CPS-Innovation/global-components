pnpm --filter cps-global-configuration build
pnpm --filter cps-global-components build 
pnpm --filter cps-global-components rollup --intro 'window.cps_global_components_build = window.cps_global_components_build || {Sha: "local", RunId: 0};' 
cp -r ./packages/cps-global-components/dist/cps-global-components.js ./e2e/harness 
pnpm --filter e2e test