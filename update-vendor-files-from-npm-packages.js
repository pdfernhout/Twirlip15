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
copyFile("node_modules/font-awesome/fonts/fontawesome-webfont.eot", "client/vendor/font-awesome/fonts/fontawesome-webfont.eot")
copyFile("node_modules/font-awesome/fonts/fontawesome-webfont.svg", "client/vendor/font-awesome/fonts/fontawesome-webfont.svg")
copyFile("node_modules/font-awesome/fonts/fontawesome-webfont.ttf", "client/vendor/font-awesome/fonts/fontawesome-webfont.ttf")
copyFile("node_modules/font-awesome/fonts/fontawesome-webfont.woff", "client/vendor/font-awesome/fonts/fontawesome-webfont.woff")
copyFile("node_modules/font-awesome/fonts/fontawesome-webfont.woff2", "client/vendor/font-awesome/fonts/fontawesome-webfont.woff2")
copyFile("node_modules/font-awesome/fonts/FontAwesome.otf", "client/vendor/font-awesome/fonts/FontAwesome.otf")

copyFile("node_modules/marked/lib/marked.esm.js", "client/vendor/marked.js")

copyFile("node_modules/push.js/bin/push.js", "client/vendor/push.js")
