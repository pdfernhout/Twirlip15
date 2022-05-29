// defines io
import { io } from "/socket.io/socket.io.esm.min.js"

// call connect after creation to set up connection
// calls onAddItem on responder passed in for connect on new items
// calls onLoaded on responder after all items initially in a file are added
// call addItem on store to add a new item
export function ItemStoreUsingServerFiles(twirlipServer, redrawCallback, responder, defaultFileName, defaultLoadFailureCallback) {

    const deferredFileChanges = []
    let isLoaded = false

    async function connect() {

        const socket = io()

        socket.on("fileChanged", async function(message) {
            if (message.stringToAppend) {
                const newItem = JSON.parse(message.stringToAppend)
                if (isLoaded) {
                    responder.onAddItem(newItem, message.filePath)
                    if (redrawCallback) redrawCallback()
                } else {
                    // Defer processing new items if they come in while initially loading file
                    deferredFileChanges.push({newItem, filePath: message.filePath})
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

        return promise
    }

    // Need to await connect before calling loadFile if not using defaultFileName.
    // Should await loadFile before calling it a second time due to isLoading flag use.
    async function loadFile(fileName, failureCallback) {

        if (!defaultFileName) defaultFileName = fileName

        isLoaded = false

        let chosenFileContents = null

        // Requesting fileContents after socket connected will automatically get fileChanged messages from server
        const apiResult = await twirlipServer.fileContents(fileName)
        if (apiResult) {
            chosenFileContents = apiResult.contents
        } else {
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

    async function addItem(item, fileName) {
        const apiResult = await twirlipServer.fileAppend(fileName || defaultFileName, JSON.stringify(item) + "\n")
        if (apiResult) {
            responder.onAddItem(item, fileName || defaultFileName)
        }
        if (redrawCallback) redrawCallback()
    }

    async function defaultSetup() {
        await connect(responder)
        await loadFile(defaultFileName, defaultLoadFailureCallback)
    }

    if (defaultFileName) {
        defaultSetup()
    }

    return {
        connect,
        loadFile,
        addItem,
    }
}
