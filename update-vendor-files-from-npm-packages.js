// Copy files from npm packages into the vendor directory

const fs = require("fs")

// Incomplete list
fs.copyFileSync("node_modules/mithril/mithril.js", "client/vendor/mithril.js")
