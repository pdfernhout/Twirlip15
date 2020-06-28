/* global m */
import "./vendor/mithril.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false
let editing = false
let editedContents = ""
let partialFileTest = ""
let fileSaveInProgress = false

async function apiCall(request) {
    let result = null
    errorMessage = ""
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
                errorMessage = json.errorMessage
            }   
        } else {
            console.log("HTTP-Error: " + response.status, response)
            errorMessage = "API request failed for file contents: " + response.status
        }
    } catch (error) {
        console.log("api call error", error)
        errorMessage = "API call error; see console for details"
    }
    setTimeout(() => m.redraw(), 0)
    return result
}

async function loadPartialFileTest(fileName) {
    const apiResult = await apiCall({request: "file-read-bytes", fileName: fileName, length: 4096})
    if (apiResult) {
        partialFileTest = apiResult.data
    }
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    editing = false
    partialFileTest = ""
    console.log("loadFileContents", chosenFileName)
    const apiResult = await apiCall({request: "file-contents", fileName: chosenFileName})
    if (apiResult) {
        chosenFileContents = apiResult.contents
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
    }
}

async function appendFile(fileName, stringToAppend, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await apiCall({request: "file-append", fileName, stringToAppend})
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

async function saveFile(fileName, contents, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await apiCall({request: "file-save", fileName, contents})
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

function viewFileContents() {
    return m("div",
        (chosenFileContents === null) && m("div", "Loading file contents..."),
        (!chosenFileLoaded && chosenFileContents === "") && m("div", 
            m("button", {onclick: () => loadPartialFileTest(chosenFileName)}, "Load partial file test"),
            partialFileTest && m("div.break-word", partialFileTest)
        ),
        chosenFileLoaded && m("div",
            m("div",
                m("button", {onclick: () => editing = false, disabled: !editing}, "View"),
                m("button.ml1", {onclick: () => {
                    editing = true
                    editedContents = chosenFileContents
                }, disabled:  editing}, "Edit"),
                m("button.ml1", {onclick: () => { 
                    appendFile(chosenFileName, editedContents, () => {
                        chosenFileContents = chosenFileContents + editedContents
                        editedContents = ""
                    })
                }, disabled: !editing || fileSaveInProgress}, "Append"),
                m("button.ml1", {onclick: () => { 
                    saveFile(chosenFileName, editedContents, () => chosenFileContents = editedContents)
                }, disabled: !editing || fileSaveInProgress}, "Save"),
                m("button.ml1", {onclick: () => { 
                    chosenFileName = ""
                    chosenFileContents = null
                    history.back()
                }, disabled: fileSaveInProgress}, "Close"),
                fileSaveInProgress && m("span.yellow", "Saving...")
            ),
            editing
                ? m("textarea.w-90", {style: {height: "400px"}, value: editedContents, onchange: event => editedContents = event.target.value})
                : m("pre.ml2.pre-wrap", chosenFileContents)
        )
    )
}

const ViewEdit = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            chosenFileName && !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading..."
            ),
            chosenFileName && chosenFileLoaded && m("div",
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewEdit)
