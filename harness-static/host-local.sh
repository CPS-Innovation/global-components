#!/bin/bash
GLOBAL_SCRIPT_URL=/cps-global-components.js BASE_PATH=/static-app npm run build

rm -rf ./host/static-app
mkdir -p ./host/static-app

# Copy out directory contents to host/static-app
cp -r ./out/* ./host/static-app/
cp ../cps-global-nav/dist/cps-global-components.* ./public/static-app/

# cp -r ./host/static-app/govuk/assets ./host

# Start http-server on the host directory with base path /static-app
npx http-server ./host -p 3000 --cors -o static-app
