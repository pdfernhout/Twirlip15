/* global m */
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

// Occlusion culling inspired by Leo Horie's essay: http://lhorie.github.io/mithril-blog/an-exercise-in-awesomeness.html
// And Leo's example linked there: http://jsfiddle.net/7JNUy/1/
function ScrolledItemsView(/* initialVNode */) {
    let scrollTop = 0
    // Use the window height to generate enough item divs the first time view is called
    let containerHeight = window.innerHeight

    // Attributes:
    // rowHeight: number of px for height of each item (fixed for now, defaults to 100)
    // items: the items to display (required)
    // viewItems: the function to display each item (required)

    function onScroll(event) {
        scrollTop = event.target.scrollTop
        containerHeight = event.target.clientHeight
    }

    return {
        view: function(vnode) {
            const rowHeight = vnode.attrs.rowHeight || "100"
            const items = vnode.attrs.items
            if (!items) throw new Error("items must be specified")
            const viewItem = vnode.attrs.viewItem
            if (!viewItem) throw new Error("viewItem must be specified")
            const rowHeightPx = rowHeight + "px"

            const begin = (scrollTop / rowHeight) || 0
            const end = begin + ((containerHeight / rowHeight) || 0) + 2
            const offset = scrollTop % rowHeight

            return m("div.flex-auto.overflow-y-scroll", 
                { onscroll: onScroll },
                m("div.relative",
                    {style: { height: items.length * rowHeight + "px", top: -offset + "px" } },
                    m("div.relative",
                        { style: {top: scrollTop + "px"} },
                        items.slice(begin, end).map(item => m("div.overflow-hidden",
                            { style: { height: rowHeightPx, maxHeight: rowHeightPx, minHeight: rowHeightPx }},
                            viewItem(item)
                        )),
                        // /* For debugging */ m(".fixed.bg-orange", {style: {top: 0, left: 0 }}, "pageY:", pageY, " pageHeight:", pageHeight, " begin:", begin, " end:", end, " offset:", offset)
                    )
                )
            )
        }
    }
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
