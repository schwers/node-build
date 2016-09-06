// TSLoader enables typescript files. If you want to just target babel compatible
// es6+ js, and let babel handle the rest, you'll need to configure compiler
// options either on your webpack config under the key path `.ts.compilerOptions`
// or add a `tsconfig` file to your project.

module.exports = {
  test: /\.tsx?$/,
  exclude: /node_modules/,
  loader: 'ts-loader',
};
