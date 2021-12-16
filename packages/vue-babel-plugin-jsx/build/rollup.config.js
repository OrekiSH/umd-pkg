const { defineConfig } = require('rollup');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const esbuild = require('rollup-plugin-esbuild').default;
const json = require('@rollup/plugin-json');

function defineBundleConfig(format, minify = false) {
  let file = `./dist/index${minify ? '.min' : ''}.js`;
  if (format === 'cjs') file = './lib/index.js';
  if (format === 'esm') file = './es/index.js';

  return defineConfig({
    input: './src/index.ts',
    output: {
      file,
      format,
      name: '@vue/babel-plugin-jsx',
    },
    plugins: [
      commonjs(),
      nodeResolve(),
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
