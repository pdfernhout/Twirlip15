/* global m, showdown */
import "../../vendor/mithril.js"
import { twirlip15ApiCall } from "../../common/twirlip15-api.js"
import "../../vendor/showdown.js"

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

function convertMarkdown(text) {
    const converter = new showdown.Converter({simplifiedAutoLink: true})
    const html = converter.makeHtml(text)
    // Add ?twirlip=view-md as needed
    const re = /(<a href="[^?>]*.md)(">)/g
    const html2 = html.replace(re, "$1?twirlip=view-md$2")
    return html2
}

function viewFileContents() {
    return m("div", m.trust(convertMarkdown(chosenFileContents)))
}

const ViewMarkdown = {
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

m.mount(document.body, ViewMarkdown)
