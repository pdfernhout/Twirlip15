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

async function appendToFile(fileName, contentsToAppend, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await TwirlipServer.fileAppend(fileName, contentsToAppend)
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

function countTrailingNewlines(text) {
    let count = 0
    for (let i = text.length - 1; i > 0; i--) {
        if (text[i] !== "\n") break
        count++
    }
    return count
}

function countLeadingNewlines(text) {
    let count = 0
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "\n") break
        count++
    }
    return count
}

function makeSeparatingNewlines(leadingText, trailingText) {
    if (!leadingText) return ""
    const count = countTrailingNewlines(leadingText) + countLeadingNewlines(trailingText)
    if (count >= 2) return ""
    if (count == 1) return "\n"
    return "\n\n"
}

function onAppendClick() {
    const newContentsToAppend = makeSeparatingNewlines(chosenFileContents, editedContentsToAppend) + editedContentsToAppend
    appendToFile(chosenFileName, newContentsToAppend, () => {
        chosenFileContents += newContentsToAppend
        editedContentsToAppend = ""
        setTimeout(() => {
            // Scroll to bottom of window
            const scrollHeight = document.body.scrollHeight
            window.scrollTo(0, scrollHeight)
        }, 100)
    })
}

function switchToEditor() {
    window.location = location.pathname + "?twirlip=edit"
}

function insertTimestamp() {
    const newTimestamp = new Date().toISOString().replace("T", " ").replace(/\....Z$/,"") + " Z"
    editedContentsToAppend += makeSeparatingNewlines(editedContentsToAppend, "")
    editedContentsToAppend += "---- " + newTimestamp + " ----\n\n"
}

function viewFileContents() {
    return m("div",
        m("pre.ml2.pre-wrap", chosenFileContents),
        m("div.ma1",
            m("button.ml1", {
                onclick: onAppendClick,
                disabled: fileSaveInProgress || !editedContentsToAppend
            }, "Append"),
            m("button.ml3", {
                onclick: insertTimestamp,
                disabled: fileSaveInProgress
            }, "Insert timestamp"),
            m("button.ml3", {
                onclick: switchToEditor,
                disabled: fileSaveInProgress || editedContentsToAppend
            }, "Edit"),
            fileSaveInProgress && m("span.yellow", "Saving...")
        ),
        m("textarea.w-90", {
            style: {height: "400px"}, 
            value: editedContentsToAppend, 
            oninput: event => editedContentsToAppend = event.target.value,
            onkeydown: interceptSaveKey(onAppendClick)
        }),
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
