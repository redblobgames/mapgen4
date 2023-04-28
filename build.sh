#!/bin/sh
mkdir -p build
esbuild --bundle generate-points-file.ts --platform=node --format=esm --external:fs --outfile=build/_generate-points-file.js
node build/_generate-points-file.js
esbuild --analyze --bundle mapgen4.ts --minify --sourcemap --outfile=build/_bundle.js
esbuild --bundle worker.ts  --sourcemap --minify --outfile=build/_worker.js
