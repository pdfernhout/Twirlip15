/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI, loadLargeFileContents } from "../../common/twirlip15-api.js"
import { ScrolledItemsView } from "../../common/ScrolledItemsView.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false
let loadingStatus = ""
let filter = ""
let filteredClippings = []
let filterIgnoreCase = true

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
        chosenFileContents = contents
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
    }
    const clippingTexts = chosenFileContents.split(clippingSeparator)
    for (const clippingText of clippingTexts) {
        if (!clippingText.trim()) continue
        const lines = clippingText.split("\r\n")
        const parts = lines[1].split("|")
        const itemNumber = clippings.length + 1
        const clipping = {
            itemNumber,
            whole: clippingText,
            wholeLowerCase: clippingText.toLowerCase(),
            title: lines[0],
            location: parts[0].trim(),
            timestamp: parts[1].trim().substring("Added on ".length),
            body: lines.slice(3).join("\n\n")
        }
        clippings.push(clipping)
    }
    filteredClippings = clippings

    // clippings.pop()
    m.redraw()
}

function viewFileContents() {
    return m(ScrolledItemsView, {
        rowHeight: 100,
        items: filteredClippings,
        viewItem: clipping => m("div.ba.h-100",
            {key: clipping.itemNumber},
            m("div.nowrap", {title: clipping.title}, clipping.itemNumber + ": " + clipping.title),
            m("div", clipping.timestamp + " " + clipping.location),
            m("div.f3", { title: clipping.body }, clipping.body)
        )
    })
}

function filterChanged(newValue) {
    filter = newValue
    if (!filterIgnoreCase) {
        filteredClippings = clippings.filter(clipping => clipping.whole.includes(filter))
        return
    }
    const lowerCaseFilter = filter.toLowerCase().trim()
    if (!lowerCaseFilter) {
        filteredClippings = clippings
        return
    }
    filteredClippings = clippings.filter(clipping => clipping.wholeLowerCase.includes(lowerCaseFilter))
}

const ViewClippings = {
    view: () => {
        return m("div.h-100.flex.flex-column.ml1",
            errorMessage && m("div.red.flex-none", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div.flex-none",
                "file not specified in URL querystring"
            ),
            chosenFileName && !chosenFileLoaded && chosenFileContents === null && m("div.flex-none",
                "Loading...",
                m("div", loadingStatus)
            ),
            chosenFileName && chosenFileLoaded &&
                m("div.flex-none.ma1", 
                    "Filter: ",
                    m("input.w-70", { value: filter, oninput: event => filterChanged(event.target.value)}),
                    m("span",
                        { title: "Ignore case" },
                        m("input[type=checkbox].ml1", {
                            checked: filterIgnoreCase, 
                            onchange: event => { filterIgnoreCase = event.target.checked; filterChanged(filter)}
                        }),
                        "ic"
                    ),
                    m("span.ml2", "#" + filteredClippings.length)
                ),
            chosenFileName && chosenFileLoaded &&
                viewFileContents()
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewClippings)
