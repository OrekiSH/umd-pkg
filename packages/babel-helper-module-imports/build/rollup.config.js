const { defineConfig } = require('rollup');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const esbuild = require('rollup-plugin-esbuild').default;
const json = require('@rollup/plugin-json');
const ts = require("rollup-plugin-typescript2");
const {cjsToEsm} = require("cjstoesm");

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
        preferBuiltins: false
      }),
      commonjs(),
      ts({
        transformers: [() => cjsToEsm()]
      }),
      esbuild({
        minify,
        jsx: 'preserve',
        jsxFactory: 'h',
      }),
      json(),
    ],
  });
}

module.exports = {
  defineBundleConfig,
};
