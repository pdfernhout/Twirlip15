import { Twirlip15ServerAPI, loadLargeFileContents, fileAppendLater } from "./twirlip15-api.js"
import { io } from "/socket.io/socket.io.esm.min.js"

// call connect after creation to set up connection
// calls onAddItem on responder passed in for connect on new items
// calls onLoaded on responder after all items initially in a file are added
// call addItem on store to add a new item
export function ItemStoreUsingServerFiles(showError, redrawCallback, defaultResponder, defaultFileName, defaultLoadFailureCallback) {

    const twirlipServer = new Twirlip15ServerAPI(showError)

    let responder = defaultResponder
    const deferredFileChanges = []

    // Separate isLoaded flag from progressObject as it includes processing all items
    let isLoaded = false
    let isSetup = false

    function parseLine(line) {
        if (!line.trim()) return undefined
        try {
            return JSON.parse(line)
        } catch (error) {
            console.log("problem parsing line:", "\"" + line + "\"", "error:", error)
            return undefined
        }
    }

    async function connect(aResponder) {
        if (aResponder) responder = aResponder

        const socket = io()

        socket.on("fileChanged", async function(message) {
            if (message.stringToAppend) {
                // may be a batch of new items
                const newItems = message.stringToAppend.split("\n").map(text => parseLine(text)) 
                if (isLoaded) {
                    for (const newItem of newItems) {
                        if (newItem !== undefined) responder.onAddItem(newItem, message.filePath)
                    }
                    if (redrawCallback) redrawCallback()
                } else {
                    // Defer processing new items if they come in while initially loading file
                    // TODO: Only need to defer items for filePath being currently loaded
                    for (const newItem of newItems) {
                        if (newItem !== undefined)  deferredFileChanges.push({newItem, filePath: message.filePath})
                    }
                }
            } else {
                // TODO: May need to reload entire file
                console.log("Unsupported change message", message)
            }
        })

        const promise = new Promise((resolve) => {
            socket.on("connect", () => {
                const clientId = socket.id
                twirlipServer.clientId = clientId
                resolve()
            })
        })

        isSetup = true
        
        return promise
    }

    // Need to await connect before calling loadFile if not using defaultFileName.
    // Should await loadFile before calling it a second time due to isLoading flag use.
    async function loadFile(fileName=defaultFileName, failureCallback=defaultLoadFailureCallback) {

        if (!defaultFileName) defaultFileName = fileName

        const progressObject = {
            fileName,
            isFileLoaded: false,
            isFileLoading: false,
            status: "",
            error: null
        }

        isLoaded = false

        // Requesting fileContents after socket connected will automatically get fileChanged messages from server
        const chosenFileContents = await loadLargeFileContents(twirlipServer, fileName, progressObject)
        if (progressObject.error || !progressObject.isFileLoaded) {
            if (failureCallback) {
                failureCallback()
            } else if (defaultLoadFailureCallback) {
                defaultLoadFailureCallback()
            }
            return
        }

        const items = chosenFileContents.split("\n").slice(0, -1).map(JSON.parse)
        for (let item of items) {
            responder.onAddItem(item, fileName)
        }

        while (deferredFileChanges.length) {
            const change = deferredFileChanges.shift()
            responder.onAddItem(change.newItem, change.filePath)
        }

        isLoaded = true

        if (responder.onLoaded) responder.onLoaded(fileName)
        
        if (redrawCallback) redrawCallback()
    }

    function addItem(item, fileName=defaultFileName) {
        const stringToAppend = JSON.stringify(item)
        fileAppendLater(twirlipServer, fileName, stringToAppend, error => {
            if (!error) {
                responder.onAddItem(item, fileName)
            } else {
                console.log("addItem error", error)
            }
            if (redrawCallback) redrawCallback()
        })
    }

    async function createNewFile(newFileName, successCallback) {
        const apiResult = await twirlipServer.fileSave(newFileName, "")
        if (apiResult && successCallback) {
            successCallback()
        }
        return apiResult
    }

    async function defaultSetup() {
        await connect(responder)
        await loadFile(defaultFileName, defaultLoadFailureCallback)
    }

    if (defaultFileName && defaultResponder) {
        defaultSetup()
    }

    return {
        twirlipServer,
        connect,
        loadFile,
        addItem,
        createNewFile,
        isSetup: () => isSetup
    }
}
