console.log("Twirlip15")

/* global process */

import path from "path"
import express from "express"
import serveIndex from "serve-index"
import util from "util"

const __dirname = path.resolve()

const host = "127.0.0.1"
const port = 8080

import fs from "fs"
const app = express()

import bodyParser from "body-parser"
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get("/twirlip15-api", function(request, response) {
    response.json({
        ok: true, 
        hello: "Hello from Twirlip15! Use POST to access the api.",
        time: new Date().toISOString(),
        supportedCommands: {
            "echo": "Echo the post data",
            "file-contents": "return contents of a file given a fileName", 
            "file-save": "save contents of a file given a fileName",
            "file-rename": "rename files given an renameFiles array of objects with oldFileName and newFileName", 
            "file-move": "moves files given a fileNames array and a newLocation", 
            "file-delete": "delete a fileNames array of file names", 
            "file-directory": "return list of files in a directory given a directoryPath",
            "file-new-directory": "make a new directory given a directoryPath"
        }
    })
})

app.post("/twirlip15-api", function(request, response) {
    if (request.body.request === "echo") {
        requestEcho(request, response)
    } else if (request.body.request === "file-contents") {
        requestFileContents(request, response)
    } else if (request.body.request === "file-save") {
        requestFileSave(request, response)
    } else if (request.body.request === "file-rename") {
        requestFileRename(request, response)
    } else if (request.body.request === "file-move") {
        requestFileMove(request, response)
    } else if (request.body.request === "file-delete") {
        requestFileDelete(request, response)
    } else if (request.body.request === "file-directory") {
        requestFileDirectory(request, response)
    } else if (request.body.request === "file-new-directory") {
        requestFileNewDirectory(request, response)
    } else {
        response.json({ok: false, errorMessage: "Unsupported request"})
    }
})

function requestEcho(request, response) {
    console.log("POST echo", request.body)
    response.json({ok: true, echo: request.body})
}

function requestFileContents(request, response) {
    console.log("POST file-contents", request.body)
    // Very unsafe!
    const filePath = path.join(__dirname, request.body.fileName)
    fs.readFile(filePath, "utf8", function (err, contents) {
        if (err) {
            console.log(err)
            response.json({ok: false, errorMessage: "Problem reading file"})
        } else {
            response.json({ok: true, contents: contents})
        }
    })
}

function requestFileSave(request, response) {
    console.log("POST file-contents", request.body)
    // Very unsafe!
    const filePath = path.join(__dirname, request.body.fileName)
    const fileContents = request.body.contents
    fs.writeFile(filePath, fileContents, function (err, contents) {
        if (err) {
            console.log(err)
            response.json({ok: false, errorMessage: "Problem writing file"})
        } else {
            response.json({ok: true})
        }
    })
}

async function requestFileRename(request, response) {
    console.log("POST file-contents", request.body)
    // Very unsafe!
    const renameFiles = request.body.renameFiles
    if (!renameFiles) {
        return response.json({ok: false, errorMessage: "renameFiles not specified"})
    }
    for (let item of renameFiles) {
        if (!item.oldFileName || !item.newFileName) {
            return response.json({ok: false, errorMessage: "renameFiles not in proper format: " + JSON.stringify(item)})
        }
    }

    const rename = util.promisify(fs.rename)

    for (let item of renameFiles) {
        try {
            await rename(path.join(__dirname, item.oldFileName), path.join(__dirname, item.newFileName))
        } catch {
            return response.json({ok: false, errorMessage: "renameFile failed for: " + JSON.stringify(item)})
        }
    }

    response.json({ok: true})
}

function requestFileDirectory(request, response) {
    console.log("POST file-directory", request.body)
    // Very unsafe!
    const filePath = path.join(__dirname, request.body.directoryPath)
    console.log("POST file-directory filePath", filePath)
    fs.readdir(filePath, {encoding: "utf8", withFileTypes: true}, function (err, entries) {
        if (err) {
            console.log(err)
            response.json({ok: false, errorMessage: "Problem reading directory"})
        } else {
            const files = []
            for (let entry of entries) {
                files.push({
                    name: entry.name,
                    isDirectory: entry.isDirectory()
                })

            }
            response.json({ok: true, files: files})
        }
    })
}

function requestFileNewDirectory(request, response) {
    console.log("POST file-new-directory", request.body)
    // Very unsafe!
    const filePath = path.join(__dirname, request.body.directoryPath)
    console.log("POST file-new-directory filePath", filePath)
    fs.mkdir(filePath, {recursive: true}, function (err) {
        if (err) {
            console.log(err)
            response.json({ok: false, errorMessage: "Problem making new directory"})
        } else {
            response.json({ok: true})
        }
    })
}

app.use(express.static(process.cwd()))
app.use(serveIndex(".", {"icons": true}))

app.listen(port, host)

console.log("cwd", process.cwd())