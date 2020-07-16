/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false

function showError(error) {
    errorMessage = error
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    const apiResult = await twirlip15ApiCall({request: "file-contents", fileName: chosenFileName}, showError)
    if (apiResult) {
        chosenFileContents = apiResult.contents
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
    }
}

function viewFileContents() {
    return m("pre", chosenFileContents)
}

const ViewMail = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div",
                "file not specified in URL querystring"
            ),
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

m.mount(document.body, ViewMail)
