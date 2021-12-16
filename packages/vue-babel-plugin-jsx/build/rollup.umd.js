const { defineBundleConfig } = require("./rollup.config");

module.exports = [
  defineBundleConfig('umd', true),
  defineBundleConfig('umd'),
];