#!/bin/bash

if [ "$1" = "--log" ]; then
  rm e2e.log
  exec > >(tee -a e2e.log)
  exec 2>&1
  E2E_FLAG=:log
fi

pnpm -w build
pnpm --filter cps-global-components rollup --intro 'window.cps_global_components_build = window.cps_global_components_build || {Sha: "local", RunId: 0, Timestamp: "2000-01-01T00:00:00Z" };'
cp -r ./packages/cps-global-components/dist/cps-global-components.js ./e2e/harness 
pnpm --filter e2e test$E2E_FLAG