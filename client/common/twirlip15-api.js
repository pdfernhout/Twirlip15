/* global m */

import { base64decode } from "../vendor/base64.js"

export async function twirlip15ApiCall(request, onerror) {
    if (!onerror) {
        onerror = errorMessage => { throw new Error(errorMessage) }
    }
    let result = null
    try {
        const response = await fetch("/twirlip15-api", {
            method: "POST",
            headers: {
            "Content-Type": "application/json;charset=utf-8"
            },
            body: JSON.stringify(request)
        })
        if (response.ok) {
            const json = await response.json()
            if (json.ok) {
                result = json
            } else {
                if (request.request !== "file-stats") {
                    onerror(json.errorMessage)
                }
            }   
        } else {
            console.log("HTTP-Error: " + response.status, response)
            onerror("API request failed for file contents: " + response.status)
        }
    } catch (error) {
        console.log("api call error", error)
        onerror("API call error; see console for details")
    }
    setTimeout(() => m.redraw(), 0)
    return result
}

function defaultAPIErrorReporter(error) {
    console.log("Twirlip15API error:", error)
}

export class Twirlip15ServerAPI {
    
    constructor(onError=defaultAPIErrorReporter, clientId=undefined) {
        this.onError = onError
        this.clientId = clientId
    }

    // Actions on directories

    async fileDirectory(directoryPath, includeStats=true, onError=null) {
        return await twirlip15ApiCall({request: "file-directory", directoryPath, includeStats}, onError || this.onError)
    }

    async fileNewDirectory(directoryPath, onError=null) {
        return await twirlip15ApiCall({request: "file-new-directory", directoryPath}, onError || this.onError)
    }

    // Actions on file names

    async fileStats(fileName, onError=null) {
        return await twirlip15ApiCall({request: "file-stats", fileName}, onError || this.onError)
    }

    async fileMove(moveFiles, newLocation, onError=null) {
        return await twirlip15ApiCall({request: "file-move", moveFiles, newLocation}, onError || this.onError)
    }
    
    async fileRename(renameFiles, onError=null) {
        return await twirlip15ApiCall({request: "file-rename", renameFiles}, onError || this.onError)
    }

    async fileRenameOne(oldFileName, newFileName, onError=null) {
        // Convenience function for single renaming
        return await twirlip15ApiCall({request: "file-rename", renameFiles: [{oldFileName, newFileName}]}, onError || this.onError)
    }

    async fileCopy(copyFromFilePath, copyToFilePath, onError=null) {
        return await twirlip15ApiCall({request: "file-copy", copyFromFilePath, copyToFilePath}, onError || this.onError)
    }

    async fileDelete(deleteFiles, onError=null) {
        return await twirlip15ApiCall({request: "file-delete", deleteFiles}, onError || this.onError)
    }
        
    // Actions on file data

    async fileSave(fileName, contents, onError=null) {
        return await twirlip15ApiCall({request: "file-save", fileName, contents, clientId: this.clientId}, onError || this.onError)
    }

    async fileAppend(fileName, stringToAppend, encoding, onError=null) {
        return await twirlip15ApiCall({request: "file-append", fileName, stringToAppend, encoding, clientId: this.clientId}, onError || this.onError)
    }
    
    async fileContents(fileName, onError=null) {
        return await twirlip15ApiCall({request: "file-contents", fileName, clientId: this.clientId}, onError || this.onError)
    }
    
    async fileReadBytes(fileName, start, length, encoding="base64", onError=null) {
        return await twirlip15ApiCall({request: "file-read-bytes", fileName, start, length, encoding, clientId: this.clientId}, onError || this.onError)
    }

    async filePreview(fileName, resizeOptions, onError=null) {
        return await twirlip15ApiCall({request: "file-preview", fileName, resizeOptions}, onError || this.onError)
    }
}

// Helper function to load larger file than 2,000,000 byte limit in API
export async function loadLargeFileContents(twirlipServer, fileName, progressObject={}) {
    progressObject.fileName = fileName
    progressObject.isFileLoaded = false
    progressObject.isFileLoading = false
    progressObject.status = ""
    progressObject.error = null

    if (!fileName) {
        const error = "fileName not defined"
        progressObject.error = error
        twirlipServer.onError(error)
        return ""
    }

    const apiResultStats = await twirlipServer.fileStats(fileName)
    if (!apiResultStats) {
        const error = "file does not exist: " + fileName
        progressObject.error = error
        twirlipServer.onError(error)
        return ""
    }

    const fileSize = apiResultStats.stats.size
    progressObject.fileSize = fileSize
    if (!fileSize) {
        // empty file
        progressObject.isFileLoaded = true
        return ""
    }

    progressObject.isFileLoading = true

    const segments = []
    const chunkSize = 1200000
    let start = 0
    while (start < fileSize) {
        progressObject.status = "reading: " + start + " of: " + fileSize + " (" + Math.round(100 * start / fileSize) + "%)"
        if (progressObject.statusCallback) progressObject.statusCallback(progressObject.status)
        const countToRead = Math.min(chunkSize, fileSize - start)

        const apiResultReadBytes = await twirlipServer.fileReadBytes(fileName, start, countToRead, "base64")

        if (!apiResultReadBytes || !apiResultReadBytes.data) {
            console.log("Unexpected: could not readBytes")
            progressObject.status = "reading failed"
            progressObject.error = "reading failed"
            progressObject.isFileLoading = false
            return
        }
        // new TextDecoder("utf-8").decode(uint8array)
        // iso8859-1
        segments.push(base64decode(apiResultReadBytes.data, new TextDecoder("ascii")))
        start += chunkSize
    }

    progressObject.status = "done loading data; joining segments"
    if (fileSize > chunkSize * 10) progressObject.status += "; this may take a while"
    if (progressObject.statusCallback) progressObject.statusCallback(progressObject.status)

    // Provide an opportunity to redraw before possibly long-running file join
    await new Promise(resolve => setTimeout(resolve, 10))

    const chosenFileContents = segments.join("")

    progressObject.status = "finished"
    if (progressObject.statusCallback) progressObject.statusCallback(progressObject.status)

    progressObject.isFileLoaded = true
    progressObject.isFileLoading = false

    return chosenFileContents
}

const LineBuffering_MaxDelay_ms = 1000
const LineBuffering_MaxQueuedLines = 1000

// Helper function for asynchronous writing of JSON objects or lines
export function fileAppendLater(twirlipServer, fileName, stringToAppend, callback) {
    if (!twirlipServer.writeCache) twirlipServer.writeCache = {
        unwrittenLines: [],
        unwrittenLinesIsWriting: false,
        unwrittenLinesTimer: null
    }
    const writeCache = twirlipServer.writeCache

    writeCache.unwrittenLines.push({fileName, stringToAppend, callback})
    scheduleWriteLines(twirlipServer)
}

function scheduleWriteLines(twirlipServer, delay_ms=LineBuffering_MaxDelay_ms) {
    const writeCache = twirlipServer.writeCache
    if (!writeCache.unwrittenLines.length) return

    if (writeCache.unwrittenLinesTimer) {
        if (writeCache.unwrittenLines.length < LineBuffering_MaxQueuedLines) return
        if (writeCache.unwrittenLinesIsWriting) return
        // Could also check if max write data size will be exceeded for API
        clearTimeout(writeCache.unwrittenLinesTimer)
        writeLines(twirlipServer)
    } else {
        writeCache.unwrittenLinesTimer = setTimeout(() => writeLines(twirlipServer), delay_ms)
    }
}

// Data consistency safety not guaranteed if failure during this routine
async function writeLines(twirlipServer) {
    const writeCache = twirlipServer.writeCache

    writeCache.unwrittenLinesTimer = null
    if (!writeCache.unwrittenLines || writeCache.unwrittenLines.length === 0) return
    if (writeCache.unwrittenLinesIsWriting) {
        // if timer fires and still writing from last timer firing, reschedule next writing for later
        scheduleWriteLines(twirlipServer)
    }
    writeCache.unwrittenLinesIsWriting = true

    const unwrittenLines = writeCache.unwrittenLines.splice(0, LineBuffering_MaxQueuedLines)

    // Separate lines to write by destination file
    const linesByFile = new Map()
    for (const line of unwrittenLines) {
        const fileName = line.fileName
        if (!linesByFile.get(fileName)) linesByFile.set(fileName, [])
        linesByFile.get(fileName).push(line)
    }

    try {
        for (const [fileName, lines] of linesByFile) { 
            const triplesTextToWrite = lines.map(line => line.stringToAppend).join("\n") + "\n"
            let writeResultError = null
            try {
                await twirlipServer.fileAppend(fileName, triplesTextToWrite)
            } catch(e) {
                twirlipServer.onError(e)
                writeResultError = e
            }
            for (const line of lines) {
                line.writeResultError = writeResultError
            }
        }
    } finally {
        writeCache.unwrittenLinesIsWriting = false
    }

    for (const line of unwrittenLines) {
        if (line.callback) line.callback(line.writeResultError, line)
    }

    if (writeCache.unwrittenLines.length) scheduleWriteLines(twirlipServer, 10)
}
