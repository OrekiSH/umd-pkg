const { defineConfig } = require('rollup');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const esbuild = require('rollup-plugin-esbuild').default;
const json = require('@rollup/plugin-json');
const replace = require('@rollup/plugin-replace');

function defineBundleConfig(format, minify = false) {
  let file = `./dist/index${minify ? '.min' : ''}.js`;
  if (format === 'cjs') file = './lib/index.js';
  if (format === 'esm') file = './es/index.js';

  return defineConfig({
    input: './src/index.ts',
    output: {
      file,
      format,
      name: '@babel/helper-module-imports',
    },
    plugins: [
      nodeResolve({
        preferBuiltins: false,
      }),
      commonjs(),
      esbuild({
        minify,
        jsx: 'preserve',
        jsxFactory: 'h',
      }),
      json(),
      replace({
        'process.env.NODE_DEBUG': JSON.stringify(false),
      }),
    ],
  });
}

module.exports = {
  defineBundleConfig,
};
