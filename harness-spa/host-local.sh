#!/bin/bash
VITE_GLOBAL_SCRIPT_URL=/cps-global-components.js npm run build

rm -rf ./host/spa-app
mkdir -p ./host/spa-app

# Copy out directory contents to host/static-app
cp -r ./dist/* ./host/spa-app/

cp ../cps-global-nav/dist/cps-global-components.* ./host/

# Start http-server on the host directory with base path /static-app
npx http-server ./host -p 3000 --cors -o spa-app