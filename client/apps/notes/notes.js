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

import { UUID } from "../../common/UUID.js"
import { Triplestore } from "../../common/Triplestore.js"

let errorMessage = ""

function showError(error) {
    if (error.message) {
        errorMessage = error.message
        throw error
    } else {
        errorMessage = error
    }
}

const t = Triplestore(showError)

let newConcept = ""

let newBlockText = ""

let selectedConcept = ""

function o(a, b, c, operation="replace") {
    if (a !== undefined && b !== undefined && c !== undefined) {
        return t.addTriple({a, b, c, o: operation})
    }

    if (a !== undefined && b !== undefined) {
        const triples = t.find(a, b, undefined, false, true)
        if (!triples.length) return undefined
        const lastTriple = t.last(triples)
        if (lastTriple.o !== "replace" && lastTriple.o) {
            return triples.map(triple => triple.c)
        }
        return lastTriple.c
    }

    throw new Error("function parameters needed")
}

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

function splitIntoBlocks(blockText) {
    const blockTexts = blockText.split("\n").filter(each => each.trim())
    for (const blockText of blockTexts) {
        // Should check if block with text already exists
        addBlock(blockText.trim())
    }
}

//

function viewBlock(blockUUID) {
    const text = getTextForBlock(blockUUID)
    const textLowercase = text.toLowerCase()
    if (selectedConcept && !blockMatchesConcept(blockUUID, selectedConcept)) return null
    const conceptMatches = getConcepts().filter(concept => textLowercase.includes(concept.toLowerCase()))
    return m("div.mt2",
        m("div", m("span.mr1", {title: blockUUID}, "▤"), text), // □ 🔗
        m("div", conceptMatches.map(concept => m("i.mr4", concept)))
    )
}

function blockMatchesConcept(blockUUID, concept) {
    const text = getTextForBlock(blockUUID)
    const textLowercase = text.toLowerCase()
   return textLowercase.includes(concept.toLowerCase())
}

function conceptUsers(concept) {
    const matches = getBlocks().filter(blockUUID => blockMatchesConcept(blockUUID, concept))
    return matches.length
}

const Notes = {
    view: () => {
        const loadingState = t.getLoadingState()

        return m("div.ma1.h-100.w-100",
            errorMessage && m("div.red.fixed.bg-light-gray.pa2.z-1", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            loadingState.isFileLoading && m("div",
                "Loading..."
            ),

            getConcepts().map(concept => m("div", m("b", concept, 
                m("span.ml2", { onclick: () => selectedConcept = concept }, "(", conceptUsers(concept), ")")))
            ),
            m("br"),
            selectedConcept ? m("div", selectedConcept, m("span.ml2", { onclick: () => selectedConcept = "" }, "X")) : "<no filter>",
            m("br"),

            m("input", { value: newConcept, onchange: event => newConcept = event.target.value}),
            m("button.ml1", { onclick: () => { addConcept(newConcept); newConcept = "" }}, "Add concept"),
            
            m("hr"),

            getBlocks().map(blockUUID => viewBlock(blockUUID)),

            m("br"),

            m("textarea", { value: newBlockText, onchange: event => newBlockText = event.target.value}),
            m("br"),
            m("button.mt1", { onclick: () => { addBlock(newBlockText); newBlockText = "" }}, "Add block"),
            m("button.ml2", { onclick: () => { splitIntoBlocks(newBlockText); newBlockText = "" }}, "Split into blocks")
        )
    }
}

function startup() {
    const filePathFromParams = decodeURI(window.location.pathname)
    t.loadFileContents(filePathFromParams)
    m.mount(document.body, Notes)
}

startup()
