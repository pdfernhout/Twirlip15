/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import { interceptSaveKey } from "../../common/menu.js"

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

const TwirlipServer = new Twirlip15ServerAPI(showError)

async function loadPartialFileTest(fileName) {
    const apiResult = await TwirlipServer.fileReadBytes(fileName, 4096)
    if (apiResult) {
        partialFileTest = apiResult.data
    }
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    partialFileTest = ""
    const apiResult = await TwirlipServer.fileContents(chosenFileName)
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
    const apiResult = await TwirlipServer.fileAppend(fileName, stringToAppend)
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

async function saveFile(fileName, contents, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await TwirlipServer.fileSave(fileName, contents)
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

function onSaveFileClick() {
    saveFile(chosenFileName, editedContents, () => {
        chosenFileContents = editedContents
        contentsSaved = editedContents
    })
}

function setMode(mode) {
    if (mode === "edit") {
        editing = true
        editedContents = chosenFileContents
        contentsSaved = editedContents
    } else {
        mode = "view"
        editing = false
    }

    const urlParams = new URLSearchParams(window.location.search)
    urlParams.set("mode", mode)
    history.replaceState({}, location.pathname, location.pathname + "?" + urlParams.toString())
}

function viewFileContents() {
    return m("div.flex.flex-column.w-100.h-100.border-box.pa2",
        m("div.flex-none",
            m("button", {
                onclick: () => setMode("view"), 
                disabled: !editing || (editing && editedContents !== contentsSaved)
            }, "View"),
            m("button.ml1", {onclick: () => {
                setMode("edit")
            }, disabled:  editing}, "Edit"),
            m("button.ml1", {onclick: () => { 
                appendFile(chosenFileName, editedContents, () => {
                    chosenFileContents = chosenFileContents + editedContents
                    editedContents = ""
                    contentsSaved = ""
                })
            }, disabled: !editing || fileSaveInProgress}, "Append"),
            m("button.ml1", {
                onclick: onSaveFileClick,
                disabled: !editing || fileSaveInProgress || editedContents === contentsSaved
            }, "Save"),
            m("button.ml1", {onclick: () => {
                history.back()
            }, disabled: fileSaveInProgress || (editing && editedContents !== contentsSaved)}, "Close"),
            m("span.yellow", { style: { 
                visibility: (fileSaveInProgress ? "visible" : "hidden") 
            }}, "Saving...")
        ),
        m("div.flex-grow-1.pt2",
            editing
                ? m("textarea.w-100.h-100", { 
                    value: editedContents, 
                    oninput: event => editedContents = event.target.value,
                    onkeydown: interceptSaveKey(onSaveFileClick)
                })
                : m("pre.pre-wrap.measure-wide", chosenFileContents)
        )
    )
}

const ViewEdit = {
    view: () => {
        return m("div.w-100.h-100",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading..."
            ),
            (!chosenFileLoaded && chosenFileContents === "") && m("div", 
                m("button", {onclick: () => loadPartialFileTest(chosenFileName)}, "Load partial file test"),
                partialFileTest && m("div.break-word", partialFileTest)
            ),
            chosenFileLoaded && viewFileContents()
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
const urlParams = new URLSearchParams(window.location.search)

if (filePathFromParams) {
    loadFileContents(filePathFromParams).then(() => {
        setMode(urlParams.get("mode") || "view")
    })
}

m.mount(document.body, ViewEdit)
