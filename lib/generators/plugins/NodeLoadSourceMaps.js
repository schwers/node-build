import { BannerPlugin } from 'webpack';
import { Generator }from 'lib/generators/Generator';

export default Generator('node-load-sourcemaps', () => (new BannerPlugin({
  banner: 'require("source-map-support").install();',
  raw: true,
  entryOnly: false,
})));