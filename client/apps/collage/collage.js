// Collage application

// Compendium/IBIS-like app
// Thanks for the inspiration, Al, and good luck with whatever you are up to now...

/**************************************
# Conceptual references

Dialogue Mapping: Building Shared Understanding of Wicked Problems
by Jeff Conklin
https://www.amazon.com/Dialogue-Mapping-Building-Understanding-Problems/dp/0470017686

The book explains how we can visualize discussions on complex topics
using the IBIS notation (Questions/Issues, Ideas, Reasons/Pros&Cons)
which provides just enough structure to aid a group's short-term memory without getting in the way.
What might be arguments over the best way to proceed become collaborations
in constructing a dialogue map exploring all the possibilities and their evaluations.

More on Dialog Mapping can be found at Jeff Conklin's website here:
http://cognexus.org/id41.htm

Compendium desktop software for IBIS:
http://compendium.open.ac.uk/

Constructing Knowledge Art: An Experiential Perspective on Crafting Participatory Representations
by Al Selvin and Simon Buckingham Shum (who created the Compendium software)
https://www.amazon.com/gp/product/1627052593

This is a broader exploration of dialog mapping and similar participatory technologies
from an advanced facilitator's perspective.
Most people would probably want to read Jeff Conklin's "how to" book on Dialogue Mapping first,
and then move onto this one once they are ready to grow further as a facilitator of group work.

# Programming references

arrow marker:
https://stackoverflow.com/questions/12680166/how-to-use-an-arrow-marker-on-an-svg-line-element
arrowhead derived from:
https://stackoverflow.com/questions/11808860/how-to-place-arrow-head-triangles-on-svg-lines
marker-end:
http://tutorials.jenkov.com/svg/marker-element.html
line to edge of circle:
https://stackoverflow.com/questions/13165913/draw-an-arrow-between-two-circles#13234898

**************************************/

/* eslint-disable no-console */
/* global CompendiumIcons, m */

"use strict"

// defines CompendiumIcons
import "../notebook/examples/ibis_icons.js"

// defines m
import "../../vendor/mithril.js"

import { SqlUtils } from "./SqlUtils.js"
import { SqlLoaderForCompendium } from "./SqlLoaderForCompendium.js"
import { HashUUIDTracker } from "../../common/HashUUIDTracker.js"
import { UUID } from "../../common/UUID.js"
import { Toast } from "../../common/Toast.js"
import { Triplestore } from "../../common/Triplestore.js"
import { expander } from "../../common/menu.js"

let collageUUID

function showError(error) {
    console.log("error", error)
    const errorMessage = error.message
        ? error.message
        : error
    Toast.toast(errorMessage)
}
window.addEventListener("error", event => showError(event))

const t = Triplestore(showError)

function getCurrentCollageUUID() {
    return t.findLast("collage:root", "currentCollage")
}

const { uuidChangedByApp, getUUID } = HashUUIDTracker("collageUUID", (uuid) => {
    // Called every time UUID changed from hash in the URL
    collageUUID = uuid
}, null, getCurrentCollageUUID() || undefined)

collageUUID = getUUID()

async function startup() {
    const filePathFromParams = decodeURI(window.location.pathname)
    await t.loadFileContents(filePathFromParams)

    if (!collageUUID) {
        collageUUID = getCurrentCollageUUID()
    }

    m.redraw()
}

// Make (invisible) arrowhead marker which is then used by lines
function viewArrowhead() {
    return m("marker", {
        id: "arrowhead",
        orient: "auto",
        markerWidth: 8,
        markerHeight: 16,
        refX: 2,
        refY: 4,
    }, m("path", { d: "M0,0 V8 L8,4 Z", fill: "black" }))
}

function myWrap(offset, itemText, maxWidth) {
    const lineHeight_em = 1.1
    const words = itemText.split(/\s+/)
    const lines = []
    let line = ""
    words.forEach((word) => {
        // if (lines.length >= 5) {
        //    line = "..."
        //    return
        // }
        if (line === "") {
            line = word
        } else if ((line + " " + word).length < maxWidth) {
            line += " " + word
        } else {
            lines.push(line)
            line = word
        }
    })
    if (line !== "") lines.push(line)
    let lineNumber = 0
    return lines.map((line) => {
        return m("tspan", {
            x: offset.x,
            y: offset.y,
            dy: (lineNumber++) * lineHeight_em  + "em",
        }, line)
    }) 
}

let textLocation = "bottom"

function viewMapLink(mapLink, origin, nodes) {
    const fromNode = nodes[mapLink.fromNode]
    const toNode = nodes[mapLink.toNode]

    if (!fromNode || !toNode) return []

    const x1 = (toNode.xPos || 0) - origin.x
    const y1 = (toNode.yPos || 0) - origin.y
    const x2 = (fromNode.xPos || 0) - origin.x
    const y2 = (fromNode.yPos || 0) - origin.y

    const xA = x1
    const yA = y1
    const xB = x2
    const yB = y2
    const radius = 24

    const d = Math.sqrt((xB - xA) * (xB - xA) + (yB - yA) * (yB - yA))
    const d2 = d - radius

    const ratio = d === 0 ? 0 : d2 / d

    const dx = (xB - xA) * ratio
    const dy = (yB - yA) * ratio

    const x = xA + dx
    const y = yA + dy

    if (isNaN(x)) {
        throw new Error("Error in link drawing")
    }

    return m("line", {
        x1: x,
        y1: y,
        x2: x2 - dx,
        y2: y2 - dy,
        "marker-end": "url(#arrowhead)",
        stroke: "black",
        "stroke-width": 1
    })
}

function changeCollageUUID(newUUID) {
    if (!newUUID) {
        console.log("changeCollageUUID problem with empty uuid")
    }
    uuidChangedByApp(newUUID)
    collageUUID = newUUID
}

function viewMapItem(mapItem, origin) {
    // const textLocation = diagram.textLocation || "bottom"
    // const hasURL = findURLRegex.exec(mapItem.label || "")
    // const followLink = hasURL ? () => window.open(hasURL[0]) : undefined
    const followLink = undefined
    // const extraStyling = hasURL ? ".underline-hover" : ""
    const extraStyling = ""
    const textParams = (textLocation === "right")
        ? {width: "" + mapItem.labelWrapWidth + "rem", height: "auto", x: -origin.x + mapItem.x + 24, y: -origin.y + mapItem.y + 8, "text-anchor": "left", onclick: followLink}
        : {width: "" + mapItem.labelWrapWidth + "rem", height: "auto", x: -origin.x + mapItem.x, y: -origin.y + mapItem.y + 34, "text-anchor": "middle", onclick: followLink}

    return [
        // mapItem === laterDraggedItem ?
        //     m("text", {x: mapItem.x, y: mapItem.y - 20, "text-anchor": "middle"}, "*") :
        //     mapItem === earlierDraggedItem ?
        //         m("text", {x: mapItem.x, y: mapItem.y - 20, "text-anchor": "middle"}, "<") :
        //        [],
        m("image", {
            "xlink:href": CompendiumIcons[mapItem.type + "_png"],
            x: -origin.x + mapItem.x - 16,
            y: -origin.y + mapItem.y - 16,
            width: 32,
            height: 32,
            alt: mapItem.type,
            ondblclick: () => {
                changeCollageUUID(mapItem.id)
            }
            // onmousedown: (event) => onmousedown(mapItem, event),
        }),
        m("text.f6" + extraStyling, textParams, myWrap({x: textParams.x, y: textParams.y}, mapItem.label, mapItem.labelWrapWidth))
    ]
}

function viewMap(uuid) {
    const mapId = uuid

    const mapViewLinks = t.find(mapId, "hasLink").map(itemJSON => JSON.parse(itemJSON))
    const mapLinks = mapViewLinks.map(link => {
        const id = link.id
        return {
            fromNode: t.findLast(id, "fromNode") || "MISSING_FROM",
            toNode: t.findLast(id, "toNode") || "MISSING_FROM",
        }
    })

    const nodes = {}

    const mapViewItems = t.find(mapId, "contains").map(itemJSON => JSON.parse(itemJSON))
    const mapItems = mapViewItems.map(item => {
        const id = item.id
        nodes[id] = item
        let type = t.findLast(id, "type") || "missing"
        type = type.charAt(0).toLowerCase() + type.substring(1)
        if (type === "pro") type = "plus"
        if (type === "con") type = "minus"
        return {
            id: id,
            label: t.findLast(id, "label") || "",
            labelWrapWidth: item.labelWrapWidth,
            type: type,
            x: item.xPos || 0,
            y: item.yPos || 0,
            // detail: t.findLast(id, "detail")
        }
    })
    // mapItems.sort((a, b) => a.label.localeCompare(b.label))
    
    const label =  t.findLast(mapId, "label")

    // Determine map bounds
    let xSizeMin = 0
    let ySizeMin = 0
    let xSizeMax = 500
    let ySizeMax = 500
    const extraSize = 200
    for (let mapItem of mapItems) {
        if (mapItem.x - extraSize < xSizeMin) xSizeMin = mapItem.x - extraSize
        if (mapItem.x + extraSize > xSizeMax) xSizeMax = mapItem.x + extraSize
        if (mapItem.y - 50 < ySizeMin) ySizeMin = mapItem.y - 50
        if (mapItem.y + extraSize > ySizeMax) ySizeMax = mapItem.y + extraSize
    }
    const xSizeMap = xSizeMax - xSizeMin
    const ySizeMap = ySizeMax - ySizeMin
    const origin = {x: xSizeMin, y: ySizeMin}

    // const scrollBarWidthAdjustment = 20

    return m("div", 
        m("div", "Map: ", uuid),
        m("div.mt2.mb2", 
            "Label: ",
            m("button.ml2.mr2", {onclick: () => {
                const newLabel = prompt("new label?", label)
                if (newLabel) t.addTripleABC(uuid, "label", newLabel)
            }}, "✎"),
            label || "unlabelled"
        ),
        m("div", // .overflow-auto", 
            // {
            //     style: {
            //         width: "" + Math.min(xSizeMap + scrollBarWidthAdjustment, document.body.clientWidth - 100) + "px",
            //         height: "" + Math.min(ySizeMap + scrollBarWidthAdjustment, document.body.clientHeight - 200) + "px"
            //     }
            // }, 
            m("svg.diagram.ba", 
                {
                    width: xSizeMap,
                    height: ySizeMap
                },
                viewArrowhead(),
                mapItems.map(mapItem => viewMapItem(mapItem, origin)),
                mapLinks.map(mapLink => viewMapLink(mapLink, origin, nodes))
            )
        ),
    )
}

let editedNote = null

function viewNote(uuid) {
    if (uuid !== editedNote) editedNote = null

    const label =  t.findLast(uuid, "label")
    const detail =  t.findLast(uuid, "detail") || ""
    return m("div", 
        m("div", "Note: ", uuid),
        m("div.mt2.mb2", 
            "Label: ",
            m("button.ml2.mr2", {onclick: () => {
                const newLabel = prompt("new label?", label)
                if (newLabel) t.addTripleABC(uuid, "label", newLabel)
            }}, "✎"),
            label || "unlabelled"
        ),
        m("div.mt2.mb2",
            "Detail:",
            m("button.ml2", {onclick: () => editedNote ? editedNote = null : editedNote = uuid}, "✎"),
            m("div",
                editedNote 
                    ? m("textarea", {rows: 10, cols: 80, value: detail, onchange: (event) => {
                        t.addTripleABC(uuid, "detail", event.target.value)
                    }})
                    : m("pre", {style: "white-space: pre-wrap", }, detail)
                
            )
        )
    )
}

function promptForNewItemForList(listId) {
    const itemLabel = prompt("New item?")
    if (!itemLabel) return

    // TODO: Pick the type
    const itemId = makeNewNode("Note", itemLabel)

    // Is "position" still needed?
    t.addTriple({a: listId, b: "contains", c: itemId, o: "insert"})
}

function viewList(uuid) {
    const listId = uuid
    const listItemIds = t.find(listId, "contains")
    const listItems = listItemIds.map(id => {
        let type = t.findLast(id, "type") || "missing"
        type = type.charAt(0).toLowerCase() + type.substring(1)
        if (type === "pro") type = "plus"
        if (type === "con") type = "minus"
        return {
            id: id,
            label: t.findLast(id, "label") || "",
            type: type
            // detail: t.findLast(id, "detail")
        }
    })
    listItems.sort((a, b) => a.label.localeCompare(b.label))
    
    const label =  t.findLast(listId, "label")
    return m("div", 
        m("div", "List: ", uuid),
        m("div.mt2.mb2", 
            "Label: ",
            m("button.ml2.mr2", {onclick: () => {
                const newLabel = prompt("new label?", label)
                if (newLabel) t.addTripleABC(uuid, "label", newLabel)
            }}, "✎"),
            label || "unlabelled"
        ),
        listItems.map(item => 
            m("div.ma2", 
                {
                    onclick: () => changeCollageUUID(item.id)
                }, 
                m("img.mr2.v-mid", {
                    "src": CompendiumIcons[item.type + "_png"],
                    style: "width: 32px; height: 32px",
                    alt: item.type
                }),
                item.label
            )
        ),
        m("button", {onclick: () => promptForNewItemForList(listId)}, "Add list item")
    )
}

function viewNode(uuid) {
    if (!uuid) throw new Error("viewNode: uuid is not defined: " + uuid)
    let type = t.findLast(uuid, "type")
    if (type === "List") return viewList(uuid)
    if (type === "Map") return viewMap(uuid)
    // if (type === "Map") return viewList(uuid)
    if (type === "Note") return viewNote(uuid)
    // TODO -- improve views
    return viewNote(uuid)
    // return m("div", "unfinished: ", uuid, " type: ", type || "MISSING TYPE")
}

// Type of Map, List, Note
function makeNewNode(type, label, detail) {
    const uuid = UUID.forType("collageNode")
    const id = uuid
    t.addTripleABC(id, "type", type, "collageNodeType")
    if (label) t.addTripleABC(id, "label", label)
    if (detail) t.addTripleABC(id, "detail", detail)
    return id
}

function makeNewMap() {
    const uuid = makeNewNode("Map").collageUUID
    changeCollageUUID(uuid)
}

function getAllMaps() {
    return t.find(null, "type", "Map")
}

function makeNewList() {
    const uuid = makeNewNode("List").collageUUID
    changeCollageUUID(uuid)
}

function getAllLists() {
    return t.find(null, "type", "List")
}

function getAllLinks() {
    return t.find(null, "type", "Link")
}

function sortItems(a, b) {
    const aLabel = t.findLast(a, "label") || a.collageUUID || ""
    const bLabel = t.findLast(b, "label") || b.collageUUID || ""
    return aLabel.localeCompare(bLabel)
}

function viewLists() {
    return expander("Lists", () => 
        m("div", getAllLists().sort(sortItems).map(item =>
            m("div.mt1",
                { onclick: () => changeCollageUUID(item) },
                t.findLast(item, "label") || item
            )
        ))
    )
}

function viewMaps() {
    return expander("Maps", () => 
        m("div", getAllMaps().sort(sortItems).map(item =>
            m("div.mt1", 
                { onclick: () => changeCollageUUID(item) }, 
                t.findLast(item, "label") || item
            )
        ))
    ) 
}

function sortLinks(a, b) {
    const aFrom = t.findLast(a, "fromNode") || ""
    const bFrom = t.findLast(b, "fromNode") || ""
    if (aFrom === bFrom) {
        const aTo = t.findLast(a, "toNode") || ""
        const bTo = t.findLast(b, "toNode") || ""
        return aTo.localeCompare(bTo)
    }
    return aFrom.localeCompare(bFrom)
}

function viewLinks() {
    return expander("Links", () => 
        m("div", getAllLinks().sort(sortLinks).map(link => {
            const fromNode = t.findLast(link, "fromNode") || "MISSING_FROM"
            const fromLabel = t.findLast({collageUUID: fromNode}, "label") || ""
            const toNode = t.findLast(link, "toNode") || "MISSING_TO"
            const toLabel = t.findLast({collageUUID: toNode}, "label") || ""
            return m("div.mt1", 
                { onclick: () => changeCollageUUID(link) },
                m("span", link),
                " :: ",
                m("span", {title: fromLabel}, fromNode),
                " --> ",
                m("span", {title: toLabel}, toNode),
            )
        }))
    ) 
}

function viewCollageButtons() {
    return m("div",
        m("button", {onclick: () => makeNewMap()}, "New Map"),
        m("button.ml2", {onclick: () => makeNewList()}, "New List"),
        m("button.ml2", {
            disabled: !!t.findLast("collageNode|1270111357180684932","author","compendiumng"),
            onclick: () => SqlLoaderForCompendium.importFeatureSuggestions(t).then(imported => { if (imported) alert("Done with import") })
        }, "Import Compendium Feature Suggestions"),
    )
}

function promptToCreateCollage() {
    const uuid = prompt("Start a collage with this UUID?", UUID.forType("collageNode"))
    if (!uuid) return
    collageUUID = uuid
    t.addTripleABC(uuid, "type", "Map", "collageNodeType")
    t.addTripleABC("collage:root", "currentCollage", uuid)
}

const TwirlipCollageApp = {
    view: () => m("div.pa3.h-100.overflow-auto",
        Toast.viewToast(),
        m("div.mt2.fixed",
            {style: {top: "0px", right: "20px"}},
            !t.getLoadingState().isFileLoaded
                ? m("i.fa.fa-spinner.fa-spin")
                : ""
        ),
        getCurrentCollageUUID() && [
            viewCollageButtons(),

            expander("Compendium Feature Suggestions SQL Tables", () => {
                SqlLoaderForCompendium.loadCompendiumFeatureSuggestions()
                return m("div.ma3.pa2",
                    SqlLoaderForCompendium.getCompendiumFeatureSuggestionsTables() && SqlUtils.viewSqlTables(SqlLoaderForCompendium.getCompendiumFeatureSuggestionsTables())
                )
            }),
            viewLists(),
            viewLinks(),
            viewMaps(),
        ],
        m("hr"),
        // m("b", "Twirlip Collage: ", collageUUID),
        (t.getLoadingState().isFileLoaded
            ? getCurrentCollageUUID()
                ? m(".mb2.pa2", viewNode(collageUUID))
                : m("button.ma3", {onclick: promptToCreateCollage}, "No map here yet. Click to start an map.")
            : "Loading..."
        ),
    )
}

m.mount(document.body, TwirlipCollageApp)

startup()
