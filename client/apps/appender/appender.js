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
let fileSaveInProgress = false

function showError(error) {
    errorMessage = error
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    const apiResult = await TwirlipServer.fileContents(chosenFileName)
    if (apiResult) {
        chosenFileContents = apiResult.contents
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
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
    return m("div",
        m("div",
            m("button", {
                onclick: () => setMode("view"), 
                disabled: !editing || (editing && editedContents !== contentsSaved)
            }, "View"),
            m("button.ml1", {onclick: () => {
                setMode("edit")
            }, disabled:  editing}, "Edit"),
            m("button.ml1", {
                onclick: onSaveFileClick,
                disabled: !editing || fileSaveInProgress || editedContents === contentsSaved
            }, "Save"),
            m("button.ml1", {onclick: () => {
                history.back()
            }, disabled: fileSaveInProgress || (editing && editedContents !== contentsSaved)}, "Close"),
            fileSaveInProgress && m("span.yellow", "Saving...")
        ),
        editing
            ? m("textarea.w-90", {
                style: {height: "400px"}, 
                value: editedContents, 
                oninput: event => editedContents = event.target.value,
                onkeydown: interceptSaveKey(onSaveFileClick)
            })
            : m("pre.ml2.pre-wrap", chosenFileContents)
    )
}

const Appender = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading..."
            ),
            chosenFileLoaded && m("div",
                viewFileContents()
            )
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

m.mount(document.body, Appender)
