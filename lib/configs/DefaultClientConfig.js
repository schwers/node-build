var ManifestPlugin = require('webpack-manifest-plugin');
var fs = require('fs-extra');
var path = require('path');
var loaders = require('./clientLoaders');
var typescriptConfig = require('./typeScriptConfig');

module.exports = {
  name: 'Client',
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
      'extract-css',
      'abort-if-errors',
      {
        generator: 'set-node-env',
        env: 'client',
      },
      new ManifestPlugin(),
    ],
  },
};
