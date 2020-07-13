/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

let errorMessage = ""
let chosenFileName = ""
let fileSaveInProgress = false
let chosenFileLoaded = false

let triples = []

function showError(error) {
    errorMessage = error
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileLoaded = false
    const apiResult = await twirlip15ApiCall({request: "file-contents", fileName: chosenFileName}, showError)
    if (apiResult) {
        const chosenFileContents = apiResult.contents
        const lines = chosenFileContents.split("\n")
        const newTriples = []
        let index = 1
        for (const line of lines) {
            if (line.trim()) {
                let triple
                try {
                    triple = JSON.parse(line)
                } catch (error) {
                    console.log("problem parsing line in file", error, line)
                    continue
                }
                triple.index = index++
                newTriples.push(triple)
            }
        }
        triples = newTriples
        chosenFileLoaded = true
    }
}

async function appendFile(fileName, stringToAppend, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await twirlip15ApiCall({request: "file-append", fileName, stringToAppend}, showError)
    fileSaveInProgress = false
    if (apiResult && successCallback) {
        successCallback()
    }
}

function addTriple(triple) {
    triple.index = triples.length + 1
    triples.push(triple)
    appendFile(chosenFileName, JSON.stringify(triple) + "\n")
}

function viewTriple(triple) {
    return m("tr", 
        m("td", triple.index),
        m("td", triple.a),
        m("td", triple.b),
        m("td", triple.c),
    )
}

function viewTriples() {
    return m("table",
        m("thead", 
            m("tr",
                m("th", ""),
                m("th", "A"),
                m("th", "B"),
                m("th", "C"),
            ),
            viewTripleFilter()
        ),
        m("tbody", filterTriples(filterTriple, triples).map(triple => viewTriple(triple)))
    )
}

function filterTriples(filterTriple, triples) {
    console.log("filterTriples", filterTriple)
    const result = []
    for (const triple of triples) {
        if (filterTriple.a.trim() && filterTriple.a.trim() !== triple.a.trim()) continue
        if (filterTriple.b.trim() && filterTriple.b.trim() !== triple.b.trim()) continue
        if (filterTriple.c.trim() && filterTriple.c.trim() !== triple.c.trim()) continue
        result.push(triple)
    }
    return result
}

let editedTriple = {a: "", b: "", c: ""}

function viewTripleEditorField(fieldName) {
    return m("div.ml2",
        m("span", fieldName.toUpperCase() + ":"),
        m("input", {
            value: editedTriple[fieldName], 
            onchange: event => editedTriple[fieldName] = event.target.value
        })
    )
}

function viewTripleEditor() {
    return m("div.mt2", 
        m("div", "New Triple"),
        viewTripleEditorField("a"),
        viewTripleEditorField("b"),
        viewTripleEditorField("c"),
        m("button", {
            onclick: () => {
                addTriple(editedTriple)
                editedTriple = {a: "", b: "", c: ""}
            }
        }, "Add triple")
    )
}

let filterTriple = {a: "", b: "", c: ""}

function viewTripleFilterField(fieldName) {
    return m("td",
        m("input", {
            value: filterTriple[fieldName], 
            onchange: event => filterTriple[fieldName] = event.target.value
        })
    )
}
function viewTripleFilter() {
    return m("tr",
        m("td", {title: "filter"}, "⧩"),
        viewTripleFilterField("a"),
        viewTripleFilterField("b"),
        viewTripleFilterField("c"),
    )
}


function find(a, b, c) {
    if (!a) a = ""
    if (!b) b = ""
    if (!c) c = ""
    return filterTriples({a, b, c}, triples)
}

function last(triples) {
    if (triples.length === 0) return {a: "", b: "", c: ""}
    return triples[triples.length - 1]
}

// recursive
function viewIBISDiagram(leader, id) {
    console.log("viewIBISDiagram", id)
    return m("div.ml4",
        m("div", { title: id, onclick: () => { editedTriple.a = id } }, leader, last(find(id, "label")).c || "Unlabelled"),
        // triples[id]["+"].map(...)
        // triples[id]["+"].last()
        // triples[id]["+"]["some data"].store()
        // triples.o100000676.plus.102323232.store()
        find(id, "+").map(triple => viewIBISDiagram(m("span.mr1", "+"), triple.c)),
        find(id, "-").map(triple => viewIBISDiagram(m("span.mr1", "-"), triple.c)),
        find(id, "!").map(triple => viewIBISDiagram(m("span.mr1", "*"), triple.c)),
        find(id, "?").map(triple => viewIBISDiagram(m("span.mr1", "?"), triple.c)),
    )
}

const IBIS = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileLoaded && m("div",
                "Loading..."
            ),
            chosenFileLoaded && m("div",
                viewTriples(),
                viewTripleEditor(),
                viewIBISDiagram("", "0")
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
loadFileContents(filePathFromParams)

m.mount(document.body, IBIS)
