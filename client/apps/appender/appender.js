/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import { interceptSaveKey } from "../../common/menu.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false
let editedContentsToAppend = ""
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
    const needsNewLine = chosenFileContents.length && chosenFileContents[chosenFileContents.length-1] !== "\n"
    const newContentsToSave = chosenFileContents + (needsNewLine ? "\n" : "") + editedContentsToAppend
    saveFile(chosenFileName, newContentsToSave, () => {
        chosenFileContents = newContentsToSave
        editedContentsToAppend = ""
    })
}

function switchToEditor() {
    window.location = location.pathname + "?twirlip=view-edit&mode=edit"
}

function viewFileContents() {
    return m("div",
        m("div.ma1",
            m("button.ml1", {
                onclick: onSaveFileClick,
                disabled: fileSaveInProgress || !editedContentsToAppend
            }, "Append"),
            fileSaveInProgress && m("span.yellow", "Saving...")
        ),
        m("textarea.w-90", {
            style: {height: "400px"}, 
            value: editedContentsToAppend, 
            oninput: event => editedContentsToAppend = event.target.value,
            onkeydown: interceptSaveKey(onSaveFileClick)
        }),
        m("button.ma1", {
            onclick: switchToEditor,
            disabled: fileSaveInProgress || editedContentsToAppend
        }, "Edit"),
        m("pre.ml2.pre-wrap", chosenFileContents)
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

if (filePathFromParams) {
    loadFileContents(filePathFromParams)
}

m.mount(document.body, Appender)
