'use strict';

const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node',
  entry: './src/extension.js', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    extensions: ['.js'],
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {
      './platform/openbsd': './platform/linux', //fix for copy-paste on windows
    }
  },
  module: {
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { context: './node_modules/copy-paste/platform', from: '**/*.vbs' }, //fix for copy-paste on windows
      ],
    }),
  ],
};
module.exports = config;