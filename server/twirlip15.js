console.log("Twirlip15")

import path from "path"
import express from "express"
import serveIndex from "serve-index"

const __dirname = path.resolve()

const host = "127.0.0.1"
const port = 8080

import fs from "fs"
const app = express()

import bodyParser from "body-parser"
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get("/twirlip15-api/hello", function(request, response) {
    response.json({data: "Hello!!"})
})

app.post("/twirlip15-api/echo", function(request, response) {
    console.log("POST file-contents", request.body)
    response.json(request.body)
})

app.post("/twirlip15-api/file-contents", function(request, response) {
    console.log("POST file-contents", request.body)
    // Very unsafe!
    const filePath = path.join(__dirname, request.body.fileName)
    fs.readFile(filePath, "utf8", function (err, data) {
        if (err) {
            console.log(err)
            response.json({ok: false, message: "Problem reading file"})
        } else {
            response.json({ok: true, data: data})
        }
    })
})

app.post("/twirlip15-api/file-directory", function(request, response) {
    console.log("POST file-directory", request.body)
    // Very unsafe!
    const filePath = path.join(__dirname, request.body.fileName)
    console.log("POST file-directory filePath", filePath)
    fs.readdir(filePath, {encoding: "utf8", withFileTypes: true}, function (err, files) {
        if (err) {
            console.log(err)
            response.json({ok: false, message: "Problem reading directory"})
        } else {
            response.json({ok: true, files: files})
        }
    })
})

app.use(express.static(process.cwd()))
app.use(serveIndex(".", {"icons": true}))

app.listen(port, host)

console.log("cwd", process.cwd())