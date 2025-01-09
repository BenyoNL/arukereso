const path = require('path');

module.exports = {
  entry: './index.js',  // Alapértelmezett belépési fájl (ha van másik, cseréld le)
  output: {
    filename: 'bundle.js',  // Az eredményül kapott fájl neve
    path: path.resolve(__dirname, 'dist'),  // Hová kerül a build fájl
  },
};
