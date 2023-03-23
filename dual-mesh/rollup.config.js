/* based on https://github.com/rollup/rollup-starter-lib/blob/master/rollup.config.js */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json';

export default [
    // browser-friendly UMD build
    {
        input: 'index.js',
        output: {
            name: 'DualMesh',
            file: pkg.browser,
            format: 'umd'
        },
        plugins: [ resolve(), commonjs() ]
    }
];
