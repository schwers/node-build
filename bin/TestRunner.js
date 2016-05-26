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

// Mocha outputs to console by default. mochaNotifier will add node-notifier notifications,
// but we need to tell it to also pass through to spec so that results are still console.log'd
function notifyingMochaInstance() {
  return new Mocha({ reporter: mochaNotifier.decorate('spec') })
}

function logTestsRunning() {
  console.log(colors.magenta(
    '\n   *******************************' +
    '\n   *        RUNNING TESTS        *' +
    '\n   *******************************'
  ));
}

// Given the md5 of a file, generates a cache buster.
// Assumes that the file test file this is being run for has either:
//    a) not been run or b) failed the last time it was run with this md5.
// This needs to know if the file has already been tested because Mocha's test runner
// has caching per file name, and in case (b) we want to re-show the failed test reports.
function cachebuster(md5, testedFile) {
  var parts = [md5];

  if (testedFile) {
    parts.push((new Date()).getTime());
  }

  return '-' +  parts.join('-');
}

function cachebustedPath(testPath, md5, testedFile) {
  return testPath + cachebuster(md5, testedFile);
}

// Given a test object from mocha, extracts the md5 we've inserted for cache busting
function testToMD5(test) {
  var match = test.file.match(/-([^-]+)(-.+)?$/);
  if (match) {
    return match[1];
  }
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

  rimraf(testDirectory, callback);
}

// TestRunner returns a function that takes the stats object from `build`, and runs tests.
// In watch mode, this needs to track file pass / fail states across incremental builds, and this is ES5,
// so a simple closure is used instead of a class.
module.exports = function TestRunner(watchMode) {
  // A map of test file md5 to test pass / fail. We track the test files by md5
  // so we don't re-run tests for files that haven't changed (unless we want to re-show the errors)
  var md5ToSucess = {};

  // A file only needs to be run through mocha if we haven't seen it before, or if it failed last time.
  // By re-running for tests that have failed, the error messages will show up in your console / notifications
  // so you can see the error info.
  function needsTesting(md5) {
    return !md5ToSucess[md5];
  }

  function testedFile(md5) {
    return md5ToSucess[md5] !== undefined;
  }

  // Takes the path to a test file, and if needed, prepares its compiled version
  // for Mocha. For a compiled test file to be ready for mocha, it needs to be copied to a
  // new path that has a cachebuster, because Mocha's test runner caches by filename.
  function prepareTestForMochaIfNeeded(srcPath) {
    var testPath = testFilePath(srcPath);
    return md5FileContents(testPath).then(function(md5) {
      if (needsTesting(md5)) {
        return copyFile(testPath, cachebustedPath(testPath, md5, testedFile(md5)));
      }
    });
  }

  function recordTestResult(test)  {
    var passed = test.state === 'passed';
    var testMD5 = testToMD5(test);

    if (testMD5) { // this should always exist
      md5ToSucess[testMD5] = passed;
    }
  }

  // setup our cleanup hook, because we can't remove all compiled test files when we're in watch mode
  process.on('SIGINT', function() {
    if (watchMode) {
      removeCompiledTests(false, process.exit); // remove everything now that we're done
      return;
    }

    process.exit();
  });

  // Use this as the callback to `build`
  return function(stats) {
    logTestsRunning();

    var mochaInstance = notifyingMochaInstance();

    function addFileToMocha(filePathPromise) {
      return filePathPromise.then(function(testPathOrNil) {
        if (testPathOrNil) {
          mochaInstance.addFile(testPathOrNil);
        }
      });
    }

    function testFromAsset(asset) { return asset.name; }

    function decideWhatTestsToRun(assets, addFileToMocha) {
      return Promise.all(assets.map(testFromAsset).map(prepareTestForMochaIfNeeded).map(addFileToMocha));
    }

    decideWhatTestsToRun(stats.assets, addFileToMocha).then(function() {
      mochaInstance
        .run()
        .on('end', function() {
          removeCompiledTests(watchMode);
        })
        .on('pass', recordTestResult)
        .on('fail', recordTestResult);
    });
  }
};
