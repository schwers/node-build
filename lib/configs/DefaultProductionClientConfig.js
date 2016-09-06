var fs = require('fs');
var path = require('path');
var ManifestPlugin = require('webpack-manifest-plugin');
var loaders = require('./clientLoaders');
var typescriptConfig = require('./typeScriptConfig');

module.exports = {
  name: 'ProductionClient',
  webpack: {
    devtool: 'source-map',
    entry: './src/Client.js',
    output: {
      generator: 'contenthash',
      dest: './build',
    },
    resolve: {
      generator: 'npm-and-modules',
      paths: ['src', 'lib'],
      extensions: ['', '.js', '.jsx', '.es6.js', '.json', '.ts', '.tsx'],
    },
    loaders,
    ts: typescriptConfig,
    plugins: [
      {
        generator: 'clean-directories',
        paths: [ 'build/' ],
      },
      {
        generator: 'extract-css',
        contenthash: true,
      },
      {
        generator: 'set-node-env',
        env: 'client',
      },
      'production-loaders',
      'minify-and-treeshake',
      'abort-if-errors',
      new ManifestPlugin(),
    ],
  },
};
