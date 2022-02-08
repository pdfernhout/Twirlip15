/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import { interceptSaveKey } from "../../common/menu.js"

import canonicalize from "../../vendor/canonicalize.js"

/* global sha256 */
import "../../vendor/sha256.js"

let errorMessage = ""
let chosenFileName = ""
let contentsSaved = ""
let chosenFileContents = null
let chosenFileLoaded = false
let editing = false
let editedContents = ""
let fileSaveInProgress = false
let sha256Saved = ""

function showError(error) {
    errorMessage = error
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

// Code goes here for saving and loading from SHA256 hashes for content
// Somehow need to associate a mimetype and/or extension with content,
// or otherwise need to decide on a single format like JSON or a Unicode string

// TODO: fix hardcoded local path
const basePath = "/home/pdfernhout/JSONStore"

function pathForSHA256(sha256String) {
    const shaPath = [
        sha256String.substring(0, 2), 
        sha256String.substring(2, 4), 
        sha256String.substring(4, 6)
    ].join("/")
    const path = basePath + "/" + shaPath
    return path
}

// content is a JavaScript Object that can be converted to canonical JSON
async function writeToJSONStore(object) {
    const canonicalJSONString = canonicalize(object)
    const sha256String = sha256(canonicalJSONString)
    const path = pathForSHA256(sha256String)
    // Maybe add optional path creation to fileSave on server
    const apiResult1 = TwirlipServer.fileNewDirectory(path)
    if (!apiResult1) throw new Error("Failed to create directory for JSON")
    const fileName = path + "/" + sha256String + ".json"
    const apiResult2 = await TwirlipServer.fileSave(fileName, canonicalJSONString)
    if (!apiResult2) throw new Error("Failed to save JSON")
    return sha256String
}

// returns JavaScript Object parsed from JSON
async function readFromJSONStore(sha256String) {
    const fileName = pathForSHA256(sha256String) + "/" + sha256String + ".json"
    const apiResult = await TwirlipServer.fileContents(fileName)
    if (!apiResult) throw new Error("Failed to read JSON")
    return JSON.parse(apiResult.contents)
}

// Code goes here for named (as JSON SHA256) append-only file of SHA256 hashes

/////////////////////////////////////

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

/*
async function saveFile(fileName, contents, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await TwirlipServer.fileSave(fileName, contents)
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}
*/

async function onSaveFileClick() {
    /*
    saveFile(chosenFileName, editedContents, () => {
        chosenFileContents = editedContents
        contentsSaved = editedContents
    })
    */
    sha256Saved = await writeToJSONStore(editedContents)
    chosenFileContents = editedContents
    contentsSaved = editedContents
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
        m("div", "SHA256:", sha256Saved || "N/A"),
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

const Archiver = {
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

m.mount(document.body, Archiver)
