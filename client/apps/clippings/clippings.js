/* global m, showdown */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI, loadLargeFileContents } from "../../common/twirlip15-api.js"

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
            wholeLowerCase: clippingText.toLowerCase(),
            title: String(clippings.length + 1) + ": " + lines[0],
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

// Occlusion culling inspired by Leo Horie's essay: http://lhorie.github.io/mithril-blog/an-exercise-in-awesomeness.html
// And Leo's example linked there: http://jsfiddle.net/7JNUy/1/
let pageY = 0 
let pageHeight = window.innerHeight
window.addEventListener("scroll", function(e) {
	pageY = Math.max(e.pageY || window.pageYOffset, 0)
	pageHeight = window.innerHeight
	m.redraw()
})

const rowHeight = 100

function viewFileContents() {
    const begin = pageY / rowHeight | 0
	const end = begin + (pageHeight / rowHeight | 0 + 2) + 1
    const offset = pageY % rowHeight

    return m("div.relative",
        {style: { height: filteredClippings.length * rowHeight + "px", top: -offset + "px" } },
        m("div.relative",
            { style: {top: pageY + "px"} },
            filteredClippings.slice(begin, end).map(clipping => m("div.ba.overflow-hidden",
                { style: { height: "100px", maxHeight: "100px", minHeight: "100px" }}, 
                m("div", clipping.title),
                m("div", clipping.location),
                m("div", clipping.timestamp),
                m("div", { title: clipping.body }, clipping.body)
            )),
            // m(".fixed.bg-orange", {style: {top: 0, left: 0 }}, "pageY:", pageY, " pageHeight:", pageHeight, " begin:", begin, " end:", end, " offset:", offset)
        )
    )
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
        return m("div.ma2",
            { style: { width: "98%"} },
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div",
                "file not specified in URL querystring"
            ),
            chosenFileName && !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading...",
                m("div", loadingStatus)
            ),
            chosenFileName && chosenFileLoaded && m("div",
                m("div", 
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
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewClippings)
