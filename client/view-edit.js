/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false
let editing = false
let editedContents = ""
let partialFileTest = ""
let fileSaveInProgress = false

function showError(error) {
    errorMessage = error
}

async function loadPartialFileTest(fileName) {
    const apiResult = await twirlip15ApiCall({request: "file-read-bytes", fileName: fileName, length: 4096}, showError)
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
    const apiResult = await twirlip15ApiCall({request: "file-contents", fileName: chosenFileName}, showError)
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
    const apiResult = await twirlip15ApiCall({request: "file-append", fileName, stringToAppend}, showError)
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

async function saveFile(fileName, contents, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await twirlip15ApiCall({request: "file-save", fileName, contents}, showError)
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

function viewFileContents() {
    return m("div",
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
                history.back()
            }, disabled: fileSaveInProgress}, "Close"),
            fileSaveInProgress && m("span.yellow", "Saving...")
        ),
        editing
            ? m("textarea.w-90", {style: {height: "400px"}, value: editedContents, onchange: event => editedContents = event.target.value})
            : m("pre.ml2.pre-wrap", chosenFileContents)
    )
}

const ViewEdit = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading..."
            ),
            (!chosenFileLoaded && chosenFileContents === "") && m("div", 
                m("button", {onclick: () => loadPartialFileTest(chosenFileName)}, "Load partial file test"),
                partialFileTest && m("div.break-word", partialFileTest)
            ),
            chosenFileLoaded && m("div",
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewEdit)
