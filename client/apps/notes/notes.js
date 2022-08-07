// Pointrel-like ideas inspired a bit by "Foam"
// https://news.ycombinator.com/item?id=23666950
// https://github.com/foambubble/foam
// Successor to ideas app

// Idea is to avoid putting explicit links if possible.
// You identify concept sas words or phrases
// (or maybe clusters of words and phrases with same sense)
// and links are automatically generated at bottom of page for words on page.

// You have text blocks that have a UUID and can have multiple versions.
// Blocks are summarized by their first line (the initial text).
// Should a separate summary line or title be possible for blocks?
// A block is essentially a paragraph.

// Blocks are assembled into structures.
// The structures could be pages with a list of blocks (and non-text items like pictures).
// Other structures could be outlines.
// Other structures could be adhoc forms or Hypercard-like database entry cards.
// Other structure could be 2D maps like Compendium.

// Should support tools for splitting blocks, merging blocks, and copying blocks.
// Also should support moving blocks or essentially replacing them with other blocks.0

/* global m */
import "../../vendor/mithril.js"

import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
// import { expander } from "../../common/menu.js"
import { UUID } from "../../common/UUID.js"
import { ObjectStore } from "../../common/ObjectStore.js"

const twirlipServer = new Twirlip15ServerAPI(error => console.log(error))

let directoryPath
let o

function loadDirectory() {
    console.log("directoryPath", directoryPath)
    o = ObjectStore(() => m.redraw(), twirlipServer, directoryPath)
}

let newConcept = ""

let newBlockText = ""

// Concepts

function getConcepts() {
    const concepts = o("concepts", "concept") || []
    concepts.sort()
    return concepts
}

function addConcept(conceptText) {
    o("concepts", "concept", conceptText, "insert")
}

// Blocks

function getBlocks() {
    return o("blocks", "block") || []
}

function addBlock(blockText) {
    const blockUuid = UUID.forType("block")
    o(blockUuid, "text", blockText)
    o(blockUuid, "created", new Date().toISOString())
    o("blocks", "block", blockUuid, "insert")
}

function getTextForBlock(blockUUID) {
    return o(blockUUID, "text") || ""
}

//

function viewBlock(blockUUID) {
    const text = getTextForBlock(blockUUID)
    const textLowercase = text.toLowerCase()
    const conceptMatches = getConcepts().filter(concept => textLowercase.includes(concept.toLowerCase()))
    return m("div.mt2", 
        m("div", text),
        m("div", conceptMatches.map(concept => m("i.mr4", concept)))
    )
}

const Notes = {
    view: () => {
        return m("div.ma1.h-100.w-100",
        
            getConcepts().map(concept => m("div", m("b", concept))),
            m("br"),

            m("input", { value: newConcept, onchange: event => newConcept = event.target.value}),
            m("button", { onclick: () => { addConcept(newConcept); newConcept = "" }}, "Add concept"),
            
            m("hr"),

            getBlocks().map(blockUUID => viewBlock(blockUUID)),

            m("br"),

            m("textarea", { value: newBlockText, onchange: event => newBlockText = event.target.value}),
            m("button", { onclick: () => { addBlock(newBlockText); newBlockText = "" }}, "Add block")
        )
    }
}

function startup() {
    directoryPath =  decodeURI(window.location.pathname)
    loadDirectory()
    m.mount(document.body, Notes)
}

startup()
