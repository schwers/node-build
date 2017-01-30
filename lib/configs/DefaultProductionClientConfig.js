var fs = require('fs');
var path = require('path');
var ManifestPlugin = require('webpack-manifest-plugin');
var loaders = require('./clientLoaders');

var webpack = require('webpack');

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
      extensions: ['', '.js', '.jsx', '.es6.js', '.json'],
    },
    loaders,
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
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
