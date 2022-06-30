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
                onerror(json.errorMessage)
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

    // Helper function to load larger file than 2,000,000 byte limit in API
    async loadLargeFileContents(fileName, progressObject={}) {
        progressObject.fileName = fileName
        progressObject.isFileLoaded = false
        progressObject.isFileLoading = false
        progressObject.status = ""
        progressObject.error = null

        if (!fileName) {
            const error = "fileName not defined"
            progressObject.error = error
            this.onError(error)
            return ""
        }

        const apiResultStats = await this.fileStats(fileName)
        if (!apiResultStats) {
            const error = "file does not exist: " + fileName
            progressObject.error = error
            this.onError(error)
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

            const apiResultReadBytes = await this.fileReadBytes(fileName, start, countToRead, "base64")

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
        if (progressObject.statusCallback) progressObject.statusCallback(progressObject.status)
    
        const chosenFileContents = segments.join("")

        progressObject.status = "finished"
        if (progressObject.statusCallback) progressObject.statusCallback(progressObject.status)

        progressObject.isFileLoaded = true
        progressObject.isFileLoading = false

        return chosenFileContents
    }
}
