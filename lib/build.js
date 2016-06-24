/* eslint-disable */

var webpack = require('webpack');
var WebpackDevServer = require('webpack-dev-server');
var notifier = require('node-notifier');
var _ = require('lodash');
var fs = require('fs');

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = function(config, cb) {
  if (!cb) { cb = function() {}; }
  config.builds.forEach(function(build) {
    executeBuild(build, cb);
  });
}

function executeBuild(build, cb) {
  var compiler = webpack(build.webpackConfig);

  if (build.watch) {
    compiler.watch({}, function(err, stats) {
      outputBuild(build.buildName)(err, stats);
      cb(stats.toJson());
    });
  } else {
    compiler.run(function(err, stats) {
      console.log(stats.toString({
        colors: !build.disableColors,
        chunks: false,
        version: false,
      }));
      cb(stats.toJson());
    });
  }

  // run the dev server in addition to webpack to pick up on the changes
  // and server them / hot reload them
  if (build.devServerConfig) {
    var server = new WebpackDevServer(compiler, build.devServerConfig);

    server.listen(build.devServerConfig.port || 8080, function() {
      console.log('dev server callback', arguments);
    });
  }
}

function formatAsset(asset) {
  var name = asset.name;
  var size = asset.size;
  var sizeStr = size + " B";

  if (size > 1000) sizeStr = Math.ceil(size / 1000) + " kB";
  if (size > 1000000) sizeStr = Math.ceil(size / 1000000) + " MB";

  return name + " [" + sizeStr + "]";
}

function outputBuild(type) {
  return function(err, stats) {
    if (!err) {
      console.log(stats.toString({
        colors: true,
        chunks: false,
        version: false,
      }));

      var s = stats.toJson();

      if (s.errors && s.errors.length) {
        notifier.notify({
          "title": type + " – ERROR!",
          "message": "Check the console for errors",
        });
      } else {
        notifier.notify({
          "title": type + " – Build complete",
          "message": s.assets.map(formatAsset).join("\n"),
        });
      }
    }
  }
}
