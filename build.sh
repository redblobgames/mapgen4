#!/bin/sh
esbuild --bundle mapgen4.js --minify --sourcemap --outfile=build/_bundle.js
esbuild --bundle worker.js --minify --sourcemap --outfile=build/_worker.js

