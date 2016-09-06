var tryToLoadGenerator = require('../tryToLoadGenerator').tryToLoadGenerator;

var TSLoader = require('./TSLoader.js');
var ESNextReactLoader = require('./ESNextReactLoader');
var JSONLoader = require('./JSONLoader');
var CSSLoader = require('./CSSLoader');
var LessLoader = require('./LessLoader');
var IgnoreStylesLoader = require('./IgnoreStylesLoader');

var loaders = {
  'typescript': TSLoader,
  'esnextreact': ESNextReactLoader,
  'ESNextReact': ESNextReactLoader,
  'json': JSONLoader,
  'css': CSSLoader,
  'less': LessLoader,
  'ignore-styles': IgnoreStylesLoader,
}

var getLoader = function(loaderName) {
  return tryToLoadGenerator(loaderName, loaders, 'loader');
}

module.exports = {
  loaders,
  getLoader,
};
