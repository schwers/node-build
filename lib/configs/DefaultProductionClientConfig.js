var fs = require('fs');
var path = require('path');
var webpack = require('webpack');
var ManifestPlugin = require('webpack-manifest-plugin');
var WebpackChunkHash = require('webpack-chunk-hash');

var loaders = require('./clientLoaders');

module.exports = {
  name: 'ProductionClient',
  webpack: {
    devtool: 'source-map',
    entry: {
      ProductionClient: './src/Client.js',
      ProductionVendor: [
        'react',
        'react-dom',
        'redux',
        'react-redux',
        'reselect',
        'babel-polyfill',
        'event-tracker',
        'superagent',
        'crypto-js',
        'react-motion',
        'jsonify',
        'raf',
        'path-to-regexp',
        'js-cookie',
        'isarray',
        'json-stable-stringify',
        'Base64',
        'punycode',
        'querystring-es3',
      ],
    },
    output: {
      generator: 'contenthash',
      dest: './build',
    },
    resolve: {
      generator: 'npm-and-modules',
      paths: ['src', 'lib'],
      extensions: ['', '.js', '.jsx', '.es6.js', '.json'],
    },
    loaders,
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
          // pull out common vendor code into a separate bundle
      new webpack.optimize.CommonsChunkPlugin({
        name: 'ProductionVendor',
        minChunks: Infinity,
      }),
      // make the chunk hashes more deterministic. without this plugin, the vendor
      // bundle receives new hashes on new builds even if the vendor list doesn't
      // change.
      // TODO: check if this is stil needed once webpack exists RC
      new WebpackChunkHash(),
      new webpack.optimize.DedupePlugin(),
      new webpack.optimize.OccurrenceOrderPlugin(),
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
        'process.env': { ENV: JSON.stringify('client') },
      },
      'production-loaders',
      new webpack.optimize.UglifyJsPlugin({
        mangle: true,
        compress: {
          warnings: false, // supress unneeded warnings,
          pure_getters: true,
          unsafe: true,
          unsafe_comps: true,
          screw_ie8: true,
        },
        output: {
          comments: false,
        },
      }),
      'abort-if-errors',
      new ManifestPlugin(),
    ],
  },
};
