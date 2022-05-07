#!/bin/sh
esbuild --bundle mapgen4.ts --sourcemap --outfile=build/_bundle.js
esbuild --bundle worker.ts  --sourcemap --outfile=build/_worker.js

