/* global m, showdown */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI, loadLargeFileContents } from "../../common/twirlip15-api.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false
let loadingStatus = ""

const clippingSeparator = "==========\r\n"
let clippings = []

function showError(error) {
    errorMessage = error
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    const contents = await loadLargeFileContents(TwirlipServer, chosenFileName, {statusCallback: message => loadingStatus = message})
    if (contents) {
        chosenFileContents = contents.replace(/"™/g, "'").replace(/â€œ/g, "\"").replace(/â€/g, "\"")
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
    }
    const clippingTexts = chosenFileContents.split(clippingSeparator)
    for (const clippingText of clippingTexts) {
        if (!clippingText.trim()) continue
        const lines = clippingText.split("\r\n")
        const parts = lines[1].split("|")
        const clipping = {
            whole: clippingText,
            title: lines[0],
            location: parts[0].trim(),
            timestamp: parts[1].trim(),
            body: lines.slice(3).join("\n\n")
        }
        clippings.push(clipping)
    }

    // clippings.pop()
    m.redraw()
}

function viewFileContents() {
    return clippings.map(clipping => m("div.mb3",
        m("div", clipping.title),
        m("div", clipping.location),
        m("div", clipping.timestamp),
        m("pre", clipping.body)
    ))
}

const ViewClippings = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div",
                "file not specified in URL querystring"
            ),
            chosenFileName && !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading...",
                m("div", loadingStatus)
            ),
            chosenFileName && chosenFileLoaded && m("div",
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewClippings)
