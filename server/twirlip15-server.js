console.log("Twirlip15 starting up", new Date().toISOString())

// WARNING: This server can read and modify files anywhere on the entire file system
// that are accessible the the server process user id.
// So, this server should only be made accessible to trusted clients.

/* global require, process, Buffer */

const fs = require("fs")
const util = require("util")
const path = require("path")
const express = require("express")
const bodyParser = require("body-parser")
const https = require("https")
const pem = require("pem")
const expressForceSSL = require("express-force-ssl")
const expressBasicAuth = require("express-basic-auth")
const bcrypt  = require("bcrypt")

let sharp
try {
    // Sharp is not easily available on all platforms (like BSD)
    sharp = require("sharp")
} catch {
    console.log("sharp is not available on this platform")
}

const preferencesFileName = "preferences.json"

let preferences = {}
try {
    preferences = JSON.parse(fs.readFileSync(preferencesFileName))
} catch (error) {
    console.log("no preferences file")
}

function getPreference(name, defaultValue) {
    const preferenceValue = preferences[name] 
    if (preferenceValue === undefined) return defaultValue
    return preferenceValue
}

const baseDir = getPreference("baseDir", "/")

const sslDirName = getPreference("sslDirName", "ssl-info/")
const sslKeyFileName = getPreference("sslKeyFileName", "ssl-key.pem")
const sslCertFileName = getPreference("sslCertFileName", "ssl-cert.pem")
const usersFileName = getPreference("usersFileName", "users/users.json")

// For remote access, you could forward a local port to the server using ssh:
// https://help.ubuntu.com/community/SSH/OpenSSH/PortForwarding
// Or you could change "host" to "0.0.0.0" listen on the network (requires adding users for basic auth)
const host = getPreference("host", "127.0.0.1")

const httpPort = getPreference("httpPort", 8015)
const httpsPort = getPreference("httpsPort", 8016)
const redirectHttpToHttps = getPreference("redirectHttpToHttps", host !== "127.0.0.1")
const requireAuthentication = getPreference("requireAuthentication", redirectHttpToHttps)

const app = express()

const maxDataForResult = getPreference("maxDataForResult", 2000000)

app.use(bodyParser.urlencoded({ limit: "1mb", extended: false }))
app.use(bodyParser.json({limit: "1mb"}))

let users = null 
let waitingOnWatchedFile = false

if (redirectHttpToHttps) {
    // Force use of SSL if not local server
    app.set("forceSSLOptions", {
        httpsPort
    })
    app.use(expressForceSSL)
}

try {
    if (requireAuthentication) {

        // Require users.json file if http-only
        users = JSON.parse(fs.readFileSync(usersFileName))

        app.use(expressBasicAuth({
            unauthorizedResponse: getUnauthorizedResponse,
            challenge: true,
            realm: "twirlip15",
                authorizeAsync: true,
                authorizer: checkHashedPasswordForUserAuthorizer
            })
        )

        fs.watch(usersFileName, (event, filename) => {
            if (filename) {
                // debounce watch events
                if (waitingOnWatchedFile) return
                waitingOnWatchedFile = setTimeout(() => {
                    waitingOnWatchedFile = false
                    console.log("Users file changes; rereading")
                    try {
                        users = JSON.parse(fs.readFileSync(usersFileName))
                    } catch (error) {
                        console.log("Problem reading " + usersFileName)
                    }
                }, 100)
            }
        })
    }
} catch (error) {
    console.log("A users file of " + usersFileName + " is required; use \"node server/add-user.js\" to make one")
    process.exit(-1)
}

async function checkHashedPasswordForUserAuthorizer(usernameSupplied, passwordSupplied, authorize) {
    const userData = users[usernameSupplied]
    if (userData === undefined) {
        return authorize(null, false)
    }
    const neededPasswordHash = userData.passwordHash
    if (neededPasswordHash === undefined) {
        return authorize(null, false)
    } else {
        const passwordMatches = await bcrypt.compare(passwordSupplied, neededPasswordHash)
        return authorize(null, passwordMatches)
    }
}

function getUnauthorizedResponse(req) {
    return req.auth
        ? ("Credentials for " + req.auth.user + " rejected")
        : "No credentials provided"
}

app.get("/twirlip15-api", function(request, response) {
    response.json({
        ok: true, 
        hello: "Hello from Twirlip15! Use POST to access the api.",
        time: new Date().toISOString(),
        supportedCommands: {
            "echo": "Echo the post data",
            "file-contents": "return contents of a file given a fileName", 
            "file-read-bytes": "return bytesRead and data for length bytes from start from a file given a fileName",
            "file-preview": "return base64Data jpeg preview given a fileName and optional resizeOptions", 
            "file-append": "append stringToAppend to a file given a fileName and an optional encoding",
            "file-save": "save contents to a file given a fileName and an optional encoding",
            "file-copy": "copy a file given an copyFromFilePath and copyToFilePath",
            "file-rename": "rename files given an renameFiles array of objects with oldFileName and newFileName",
            "file-move": "moves files given a fileNames array and a newLocation", 
            "file-delete": "delete files in a deleteFiles array of file paths", 
            "file-directory": "return list of files in a directory given a directoryPath, with extra stats if includeStats is true",
            "file-new-directory": "make a new directory given a directoryPath"
        }
    })
})

app.post("/twirlip15-api", function(request, response) {
    if (request.body.request === "echo") {
        requestEcho(request, response)
    } else if (request.body.request === "file-contents") {
        requestFileContents(request, response)
    } else if (request.body.request === "file-read-bytes") {
        requestFileReadBytes(request, response)
    } else if (request.body.request === "file-preview") {
        requestFilePreview(request, response)
    } else if (request.body.request === "file-append") {
        requestFileAppend(request, response)
    } else if (request.body.request === "file-save") {
        requestFileSave(request, response)
    } else if (request.body.request === "file-copy") {
        requestFileCopy(request, response)
    } else if (request.body.request === "file-rename") {
        requestFileRename(request, response)
    } else if (request.body.request === "file-move") {
        requestFileMove(request, response)
    } else if (request.body.request === "file-delete") {
        requestFileDelete(request, response)
    } else if (request.body.request === "file-stats") {
        requestFileStats(request, response)
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

// Fails if required field is missing or empty
function failForRequiredField(request, response, fieldName) {
    const value = request.body[fieldName]
    if (!request.body[fieldName] || typeof value !== "string") {
        const errorMessage = "API call missing required field: " + fieldName
        console.log("Error:", errorMessage)
        response.json({ok: false, errorMessage})
        return true
    }
    return false
}

// Similar to failForRequiredField but accepts empty strings
function failForMissingRequiredField(request, response, fieldName) {
    const value = request.body[fieldName]
    if (typeof value !== "string") {
        const errorMessage = "API call missing required field: " + fieldName
        console.log("Error:", errorMessage)
        response.json({ok: false, errorMessage})
        return true
    }
    return false
}

async function requestFileContents(request, response) {
    console.log("POST file-contents", request.body)
    if (failForRequiredField(request, response, "fileName")) return
    const filePath = path.join(baseDir, request.body.fileName)
    const encoding = request.body.encoding || "utf8"
    try {
        const stat = await fs.promises.lstat(filePath)
        if (stat.size > maxDataForResult) {
            response.json({ok: false, errorMessage: "File size of " + stat.size + " too big to return all at once; max size: " + maxDataForResult})
            return
        }
        try {
            const contents = await fs.promises.readFile(filePath, encoding)
            response.json({ok: true, contents: contents})
        } catch(err) {
            console.log(err)
            response.json({ok: false, errorMessage: "Problem reading file"})
        }
    } catch(error) {
        console.log(error)
        response.json({ok: false, errorMessage: "Problem stat-ing file"})
    }
}

const fsRead = util.promisify(fs.read)

async function requestFileReadBytes(request, response) {
    console.log("POST file-read-bytes", request.body)
    if (failForRequiredField(request, response, "fileName")) return
    const filePath = path.join(baseDir, request.body.fileName)
    const start = request.body.start || 0
    const length = request.body.length || 0
    // encoding can be "hex" or "utf8"
    const encoding = request.body.encoding || "hex"
    if (length > maxDataForResult) {
        response.json({ok: false, errorMessage: "Requested length is too big to return all at once; max length: " + maxDataForResult})
        return
    }
    try {
        const fileHandle = await fs.promises.open(filePath)
        try {
            const buffer = Buffer.alloc(length)
            const readResult = await fsRead(fileHandle.fd, buffer, 0, length, start)
            response.json({ok: true, data: buffer.toString(encoding), bytesRead: readResult.bytesRead})
        } catch(err) {
            console.log(err)
            response.json({ok: false, errorMessage: "Problem reading file"})
        } finally {
            await fileHandle.close()
        }
    } catch (err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem opening file"})
    }
}

async function requestFilePreview(request, response) {
    console.log("POST file-preview", request.body)
    if (!sharp) {
        response.json({ok: false, errorMessage: "Problem previewing file; sharp not available on server"})
        return
    }
    if (failForRequiredField(request, response, "fileName")) return
    const filePath = path.join(baseDir, request.body.fileName)
    const defaultResizeOptions = { width: 100, height: 100, fit: "inside", withoutEnlargement: true }
    const resizeOptions = request.body.resizeOptions || defaultResizeOptions
    try {
        sharp(filePath).
        resize(resizeOptions)
        .toFormat("jpeg")
        .toBuffer()
        .then(data => { response.json({ ok: true, base64Data: data.toString("base64") }) })
        .catch(error => { console.log(error); response.json({ok: false, errorMessage: "Problem previewing file: " + error}) })
    } catch(err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem previewing file"})
    }
}

async function requestFileAppend(request, response) {
    console.log("POST file-append", request.body)
    if (failForRequiredField(request, response, "fileName")) return
    const filePath = path.join(baseDir, request.body.fileName)
    const stringToAppend = request.body.stringToAppend
    const encoding = request.body.encoding || "utf8"
    try {
        await fs.promises.appendFile(filePath, stringToAppend, encoding)
        response.json({ok: true})
    } catch(err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem appending to file"})
    }
}

async function requestFileSave(request, response) {
    console.log("POST file-save", request.body)
    if (failForRequiredField(request, response, "fileName")) return
    const filePath = path.join(baseDir, request.body.fileName)
    if (failForMissingRequiredField(request, response, "contents")) return
    const fileContents = request.body.contents
    const encoding = request.body.encoding || "utf8"
    try {
        await fs.promises.writeFile(filePath, fileContents, encoding)
        response.json({ok: true})
    } catch(err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem writing file"})
    }
}

async function requestFileCopy(request, response) {
    console.log("POST file-copy", request.body)
    if (failForRequiredField(request, response, "copyFromFilePath")) return
    const copyFromFilePath = path.join(baseDir, request.body.copyFromFilePath)
    if (failForRequiredField(request, response, "copyToFilePath")) return
    const copyToFilePath = path.join(baseDir, request.body.copyToFilePath)
    try {
        await fs.promises.copyFile(copyFromFilePath, copyToFilePath)
        response.json({ok: true})
    } catch(err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem copying file"})
    }
}

async function requestFileRename(request, response) {
    console.log("POST file-rename", request.body)
    const renameFiles = request.body.renameFiles
    if (!renameFiles) {
        return response.json({ok: false, errorMessage: "renameFiles not specified"})
    }
    for (let item of renameFiles) {
        if (!item.oldFileName || !item.newFileName) {
            return response.json({ok: false, errorMessage: "renameFiles not in proper format: " + JSON.stringify(item)})
        }
    }

    for (let item of renameFiles) {
        try {
            await fs.promises.rename(path.join(baseDir, item.oldFileName), path.join(baseDir, item.newFileName))
        } catch {
            return response.json({ok: false, errorMessage: "renameFile failed for: " + JSON.stringify(item)})
        }
    }

    response.json({ok: true})
}

async function requestFileMove(request, response) {
    console.log("POST file-move", request.body)
    const moveFiles = request.body.moveFiles
    if (!moveFiles) {
        return response.json({ok: false, errorMessage: "moveFiles not specified"})
    }

    const newLocation = request.body.newLocation
    if (!newLocation) {
        return response.json({ok: false, errorMessage: "newLocation not specified"})
    }

    // TODO: better handling and reporting if some files moved but others are not
    for (let fileName of moveFiles) {
        try {
            const oldFileName = path.join(baseDir, fileName)
            const shortFileName = path.basename(fileName)
            const newFileName = path.join(baseDir, newLocation, shortFileName)
            await fs.promises.rename(oldFileName, newFileName)
        } catch (err) {
            console.log(err)
            return response.json({ok: false, errorMessage: "file move failed for: " + JSON.stringify(fileName)})
        }
    }

    response.json({ok: true})
}

async function requestFileDelete(request, response) {
    console.log("POST file-delete", request.body)
    const deleteFiles = request.body.deleteFiles
    if (!deleteFiles) {
        return response.json({ok: false, errorMessage: "deleteFiles not specified"})
    }

    // TODO: better handling and reporting if some files deleted but others are not
    // TODO: better reporting when directory can't be deleted because it is not empty
    for (let fileName of deleteFiles) {
        try {
            const filePath = path.join(baseDir, fileName)
            const stat = await fs.promises.lstat(filePath)
            if (stat.isFile()) {
                await fs.promises.unlink(filePath)
            } else {
                // await fs.promises.rmdir(filePath, {recursive: true})
                await fs.promises.rmdir(filePath)
            }
        } catch (err) {
            console.log(err)
            return response.json({ok: false, errorMessage: "file delete failed for: " + JSON.stringify(fileName)})
        }
    }

    response.json({ok: true})
}

async function requestFileStats(request, response) {
    if (failForRequiredField(request, response, "fileName")) return
    try {
        const filePath = path.join(baseDir, request.body.fileName)
        const stats = await fs.promises.lstat(filePath)
        response.json({ok: true, stats, fileName: request.body.fileName})
    } catch (err) {
        console.log(err)
        return response.json({ok: false, errorMessage: "file stat failed for: " + JSON.stringify(request.body.fileName)})
    }    
}

async function requestFileDirectory(request, response) {
    console.log("POST file-directory", request.body)
    if (failForRequiredField(request, response, "directoryPath")) return
    const filePath = path.join(baseDir, request.body.directoryPath)
    const includeStats = request.body.includeStats || false
    console.log("POST file-directory filePath", filePath)
    try {
        const entries = await fs.promises.readdir(filePath, {encoding: "utf8", withFileTypes: true})
        const files = []
        for (let entry of entries) {
            let stats = null
            if (includeStats) stats = await fs.promises.lstat(path.join(filePath, entry.name))
            files.push({
                name: entry.name,
                isBlockDevice: entry.isBlockDevice(),
                isCharacterDevice: entry.isCharacterDevice(),
                isDirectory: entry.isDirectory(),
                isFIFO: entry.isFIFO(),
                isFile: entry.isFile(),
                isSocket: entry.isSocket(),
                isSymbolicLink: entry.isSymbolicLink(),
                stats: stats
            })
        }
        response.json({ok: true, files: files})
    } catch (err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem reading directory"})
    }
}

async function requestFileNewDirectory(request, response) {
    console.log("POST file-new-directory", request.body)
    if (failForRequiredField(request, response, "directoryPath")) return
    const filePath = path.join(baseDir, request.body.directoryPath)
    console.log("POST file-new-directory filePath", filePath)
    try {
        await fs.promises.mkdir(filePath, {recursive: true})
        response.json({ok: true})
    } catch (err) {
        console.log(err)
        response.json({ok: false, errorMessage: "Problem making new directory"})
     }
}

app.get("/favicon.ico", (req, res) => {
    res.sendFile(process.cwd() + "/client/favicon/favicon.ico")
})

app.use("/twirlip15", express.static(process.cwd() + "/client"))

app.use((req, res, next) => {
    console.log("querystring", req.query, req.originalUrl)
    console.log("req.url 1", req.url)
    const twirlip = req.query.twirlip
    if (twirlip) {
        // Special handling for urls with a querystring like: /some/path/something?twirlip=editor
        const appName = twirlip.replace(/[^0-9a-z-]/gi, "")
        console.log("send app file for twirlip", appName)
        res.sendFile(process.cwd() + "/client/apps/" + appName + "/" + appName + ".html")
    } else if (req.url.endsWith("/") && !req.query.twirlip) {
        // Use the filer app to handle interacting with directories
        res.status(301).redirect(req.url + "?twirlip=filer")
    } else {
        next()
    }
})

app.use("/", express.static("/"))

console.log("Twirlip serving from directory", process.cwd())

app.listen(httpPort, host)
console.log("info", "Twirlip server listening at http://" + host + ":" + httpPort)

function readOrCreateSSLCertificateKeys() {
    // load certificates if available or otherwise create them
    let serviceKey
    let certificate
    let keysPromise
    try {
        serviceKey = fs.readFileSync(sslDirName + sslKeyFileName)
        certificate = fs.readFileSync(sslDirName + sslCertFileName)
        keysPromise = Promise.resolve({serviceKey, certificate})
    } catch (error) {
        console.log("Could not read certificate files; creating self-signed certificate")
        if (!fs.existsSync(sslDirName)) {
            fs.mkdirSync(sslDirName)
        }
        keysPromise = new Promise((resolve, reject) => {
            pem.createCertificate({ days: 365, selfSigned: true }, function(err, keys) {
                if (err) {
                    console.log("Problem creating https certificate", err)
                    reject("Problem creating https certificate")
                } 
                fs.writeFileSync(sslDirName + sslKeyFileName, keys.serviceKey)
                fs.writeFileSync(sslDirName + sslCertFileName, keys.certificate)
                resolve({serviceKey: keys.serviceKey, certificate: keys.certificate})
            })
        })
    }
    return keysPromise
}

function startHttpsServer() {
    readOrCreateSSLCertificateKeys().then(keys => {
        // Create an HTTPS service
        const httpsServer = https.createServer({ key: keys.serviceKey, cert: keys.certificate }, app).listen(httpsPort, host, function () {
            const host = httpsServer.address().address
            const port = httpsServer.address().port
            console.log("info", "Twirlip server listening at https://" + host + ":" + port)
        })
    })
}

if (httpsPort) {
    startHttpsServer()
}
