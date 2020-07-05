/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

let errorMessage = ""
let chosenFileName = ""
let contentsSaved = ""
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

function interceptSaveKey(evt) {
    // derived from: https://stackoverflow.com/questions/2903991/how-to-detect-ctrlv-ctrlc-using-javascript
    var c = evt.keyCode
    var ctrlDown = evt.ctrlKey || evt.metaKey // Mac support

    // Check for Alt+Gr (http://en.wikipedia.org/wiki/AltGr_key)
    if (ctrlDown && evt.altKey) return true

    // Check for ctrl+s
    if (ctrlDown && c == 83) {
        saveFile(chosenFileName, editedContents, () => {
            chosenFileContents = editedContents
            contentsSaved = editedContents
        })
        return false
    }

    // Otherwise allow
    return true
}

function viewFileContents() {
    return m("div",
        m("div",
            m("button", {onclick: () => editing = false, disabled: !editing}, "View"),
            m("button.ml1", {onclick: () => {
                editing = true
                editedContents = chosenFileContents
                contentsSaved = editedContents
            }, disabled:  editing}, "Edit"),
            m("button.ml1", {onclick: () => { 
                appendFile(chosenFileName, editedContents, () => {
                    chosenFileContents = chosenFileContents + editedContents
                    editedContents = ""
                    contentsSaved = ""
                })
            }, disabled: !editing || fileSaveInProgress}, "Append"),
            m("button.ml1", {onclick: () => { 
                saveFile(chosenFileName, editedContents, () => {
                    chosenFileContents = editedContents
                    contentsSaved = editedContents
                })
            }, disabled: !editing || fileSaveInProgress || editedContents === contentsSaved }, "Save"),
            m("button.ml1", {onclick: () => { 
                history.back()
            }, disabled: fileSaveInProgress}, "Close"),
            fileSaveInProgress && m("span.yellow", "Saving...")
        ),
        editing
            ? m("textarea.w-90", {
                style: {height: "400px"}, 
                value: editedContents, 
                oninput: event => editedContents = event.target.value,
                onkeydown: interceptSaveKey
            })
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
