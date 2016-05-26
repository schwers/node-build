#!/usr/bin/env node
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var debug = require('debug')('blueprints');
var Mocha = require('mocha');
var mochaNotifier = require('mocha-notifier-reporter');
var colors = require('colors');
var rimraf = require('rimraf');
var process = require('process');
var md5File = require('md5-file');

var build = require('../lib/build');
var makeBuild = require('../lib/makeBuild').makeBuild;
var configs = require('../lib/configs');
var getWebpackEntryForTest = require('../lib/getWebpackEntryForTest');
var testDirectory = configs.DefaultTestingConfig.webpack.output.path;

var argv = require('yargs')
  .alias('b', 'blueprintsPath')
    .describe('b', 'path to a raw-config via a node file with moduel.exports = config')
    .default('b', './blueprints.config.js')
  .alias('p', 'production')
    .describe('p', 'enable production settings for the default build cofings')
    .default('p', false)
  .alias('c', 'client')
    .describe('c', 'use the default client build, assumes you have an entry point to a client at ~/lib/client.[some es6.js or .js or .jsx]')
    .default('c', false)
  .alias('s', 'server')
    .describe('s', 'use the default server build, assumes you have an entry point to a server at ~/lib/server[some es6.js or .js or .jsx]')
    .default('s', false)
  .alias('a', 'clientAndServer')
    .describe('a', '[DEFAULT=true] use both a client and a server build. checks if you have an extend build and applies it.')
    .default('a', true)
  .alias('w', 'watch')
    .describe('w', '[DEFAULT=false] force watching of all builds')
    .default('w', false)
  .alias('i', 'ignoreBlueprints')
    .describe('ignore the blueprints.config.js file in the current directory and use defaults')
    .default('i', false)
  .alias('t', 'runTest')
    .describe('search for test files and run them')
    .default('t', false)
  .argv;

console.log('...Reading Blueprints', argv.blueprintsPath);
console.log('...cwd', process.cwd());

function loadBuildsFromPath(configPath) {
  try {
    console.log('...loading bluerprints from', configPath)
    var builds = require(path.resolve(configPath));
    if (!Array.isArray(builds)) {
      if (builds.extensions === true) {
        return { extensions: _.omit(builds, 'extensions') };
      }
      builds = [builds];
    }

    return { builds }
  } catch (e) {
    debug(e);
    return {};
  }
}

function applyExtensions(builds, extensions) {
  var ext = extensions || {};
  console.log('...applying extensions', extensions);
  return builds.map(function(build) { return _.merge(build, ext ); });
}

function makeConfig(builds, extensions) {
  return { builds: applyExtensions(builds, extensions).map(makeBuild) };
}

var builds = [];
var extensions = {};

if (argv.blueprintsPath && !argv.ignoreBlueprints) {
  var blueprints = loadBuildsFromPath(argv.blueprintsPath);
  if (blueprints.extensions) {
    extensions = blueprints.extensions;
  } else if (blueprints.builds && blueprints.builds.length) {
    builds = blueprints.builds;
  }
}

function loadDefaultConfigs() {
  console.log('...using default configs');
  if (argv.runTest) {
    console.log('...Setting up tests:');
    builds = [ configs.DefaultTestingConfig ];
    builds[0].webpack.entry = getWebpackEntryForTest('./');
  } else if (argv.client) {
    console.log('...client');
    builds = [ configs.getClientConfig(argv.production) ];
  } else if (argv.server) {
    console.log('...server');
    builds = [ configs.getServerConfig(argv.production) ];
  } else if (argv.clientAndServer) {
    console.log('...both');
    builds = [
      configs.getClientConfig(argv.production),
      configs.getServerConfig(argv.production),
    ];
  }
}

if (!builds.length) {
  loadDefaultConfigs();
}

if (argv.watch) {
  extensions.watch = true;
}


function testFilePath(filePath) {
  return path.join(testDirectory, filePath);
}

function md5FileContents(filePath) {
  return new Promise(function(resolve, reject){
    md5File(filePath, function(err, hash) {
      if (err) {
        console.warn('error md5ing', filePath, ':', err);
        reject(err);
        return;
      }

      resolve(hash);
    })
  });
}

function copyFile(src, dest) {
  return new Promise(function(resolve, reject) {
    fs.copy(path.resolve(src), path.resolve(dest), function() {
      resolve(dest);
    });
  })
}

// Removes the compiled test files if its safe to do so, then calls a callback. It's not safe
// to remove the compiled files if we're running in watch mode, as webpack relies on them.
function removeCompiledTests(watching,  cb) {
  if (!watching) {
    rimraf(testDirectory, cb || function() {});
  }
}

// Mocha outputs to console by default. mochaNotifier will add node-notifier notifications,
// but we need to tell it to also pass through to spec so that results are still console.log'd
function notifyingMochaInstance() {
  return new Mocha({ reporter: mochaNotifier.decorate('spec') })
}


function testrunner(watchMode) {
  var md5ToSucess = {};

  function logTestsRunning() {
    console.log(colors.magenta(
      '\n   *******************************' +
      '\n   *        UPDATNG TESTS        *' +
      '\n   *******************************'
    ));
  }

  function shouldRunTests(md5) {
    return !md5ToSucess[md5]; // note, unseen files will return true (!undefined)
  }

  function testedFile(md5) {
    return md5ToSucess[md5] !== undefined;
  }

  function cachebustedPath(testPath, sourceFileMD5) {
    return testPath + cachebuster(sourceFileMD5)
  }

  // Given the md5 of a file, generates a cache buster.
  // Assumes that the file test file this is being run for has either:
  //    a) not been run or b) failed the last time it was run with this md5.
  // This needs to check what files have already been tested because Mocha's test runner
  // has caching per file name, and in case (b) we want to re-show the failed test reports.
  // (If there was no fallback cache buster, and we're in case (b), we know those contents failed)
  function cachebuster(md5) {
    var parts = [md5];

    if (testedFile(md5)) {
      parts.push((new Date()).getTime());
    }

    return '-' +  parts.join('-');
  }

  function runTestIfNeeded(srcPath, addFileToMocha) {
    var testPath = testFilePath(srcPath);

    return new Promise(function(resolve, reject) {
      md5FileContents(testPath).then(function(md5) {
        console.log('should test file?', testPath, md5);
        if (shouldRunTests(md5)) {
          console.log('yes! copying');
          copyFile(testPath, cachebustedPath(testPath, md5)).then(function(newPath) {
            console.log('adding to mocha?', newPath)
            addFileToMocha(newPath);
            resolve();
          });

          return;
        }

        console.log('no, resolving early');
        resolve();
      })
    });
  }

  function testToMD5(test) {
    var match = test.file.match(/-([^-]+)(-.+)?$/);
    if (match) {
      return match[1];
    }
  }

  function updateTests(test, passed)  {
    console.log('tests ran!', passed);
    var testMD5 = testToMD5(test);

    if (testMD5) {
      console.log('updating bookkeeping', testMD5);
      md5ToSucess[testMD5] = passed;
    }
  }

  function prepareTests(assets, addFileToMocha) {
    var promises = [];
    console.log('files changed, checking tests', md5ToSucess);
    assets.forEach(function(asset) {
      promises.push(runTestIfNeeded(asset.name, addFileToMocha));
    });

    return Promise.all(promises);
  }

  // setup our cleanup hook, because we can't remove compiled test files when we're in watch mode
  process.on('SIGINT', function() {
    if (argv.runTest && watchMode) {
      removeCompiledTests(false, process.exit); // remove everything now that we're done
      return;
    }

    process.exit();
  });

  return function(stats) {
    if (argv.runTest) {
      logTestsRunning();

      var mochaInstance = notifyingMochaInstance();
      var addFileToMocha = mochaInstance.addFile.bind(mochaInstance);

      prepareTests(stats.assets, addFileToMocha).then(function() {
        mochaInstance
          .run()
          .on('end', function() {
            removeCompiledTests(watchMode);
          })
          .on('pass', function(tests) {
            updateTests(tests, true);
          })
          .on('fail', function(tests) {
            updateTests(tests, false);
          });
      });
    }
  }
}

build(makeConfig(builds, extensions), testrunner(extensions.watch));
