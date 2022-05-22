// Copy files from npm packages into the vendor directory

const fs = require("fs")
var path = require("path")


function copyFile(source, dest) {
    const dir1 = path.dirname(dest)
    const dir2 = path.dirname(dir1)
    if (!fs.existsSync(dir2)) {
        fs.mkdirSync(dir2)
    }
    if (!fs.existsSync(dir1)) {
        fs.mkdirSync(dir1)
    }
    fs.copyFileSync(source, dest)
}

// Incomplete list
copyFile("node_modules/mithril/mithril.js", "client/vendor/mithril.js")
copyFile("node_modules/font-awesome/css/font-awesome.css", "client/vendor/font-awesome/css/font-awesome.css")
