var colors = require('colors');
var fs = require('fs-extra'); // provides copy
var md5File = require('md5-file');
var Mocha = require('mocha');
var mochaNotifier = require('mocha-notifier-reporter');
var path = require('path');
var process = require('process');
var rimraf = require('rimraf');

var configs = require('../lib/configs');
var testDirectory = configs.DefaultTestingConfig.webpack.output.path;

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

function globForCachebustedTests(rootDirectory) {
  var glob = rootDirectory;
  if (glob[glob.length - 1] !== '/') {
    glob += '/';
  }

  return glob + '**/*.compiledtest-*';
}

// Removes all compiled test files if its safe to do so, then calls a callback. It's not safe
// to remove the original compiled files if we're running in watch mode, as webpack relies on them.
// We can however remove the cache-busted versions of the files to free up space.
function removeCompiledTests(watching,  cb) {
  var callback = cb || function() {};

  if (watching) {
    rimraf(globForCachebustedTests(testDirectory), callback);
    return;
  }

  rimraf(testDirectory, cb || function() {});
}


// Mocha outputs to console by default. mochaNotifier will add node-notifier notifications,
// but we need to tell it to also pass through to spec so that results are still console.log'd
function notifyingMochaInstance() {
  return new Mocha({ reporter: mochaNotifier.decorate('spec') })
}

function logTestsRunning() {
  console.log(colors.magenta(
    '\n   *******************************' +
    '\n   *        UPDATNG TESTS        *' +
    '\n   *******************************'
  ));
}

module.exports = function TestRunner(watchMode) {
  var md5ToSucess = {};

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
    if (watchMode) {
      removeCompiledTests(false, process.exit); // remove everything now that we're done
      return;
    }

    process.exit();
  });

  return function(stats) {
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
};
