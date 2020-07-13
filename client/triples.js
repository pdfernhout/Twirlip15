/* global m */
import "./vendor/mithril.js"
import { Triplestore } from "./Triplestore.js"

let errorMessage = ""

function showError(error) {
    errorMessage = error
}

const t = Triplestore(showError)

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
        m("tbody", t.filterTriples(filterTriple).map(triple => viewTriple(triple)))
    )
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
                t.addTriple(editedTriple)
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

// recursive
function viewIBISDiagram(leader, id) {
    console.log("viewIBISDiagram", id)
    return m("div.ml4",
        m("div", { title: id, onclick: () => { editedTriple.a = id } }, leader, t.last(t.find(id, "label")) || "Unlabelled"),
        // triples[id]["+"].map(...)
        // triples[id]["+"].last()
        // triples[id]["+"]["some data"].store()
        // triples.o100000676.plus.102323232.store()
        t.find(id, "+").map(childId => viewIBISDiagram(m("span.mr1", "+"), childId)),
        t.find(id, "-").map(childId => viewIBISDiagram(m("span.mr1", "-"), childId)),
        t.find(id, "!").map(childId => viewIBISDiagram(m("span.mr1", "*"), childId)),
        t.find(id, "?").map(childId => viewIBISDiagram(m("span.mr1", "?"), childId)),
    )
}

const IBIS = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !t.getLoadingState().isFileLoaded && m("div",
                "Loading..."
            ),
            t.getLoadingState().isFileLoaded && m("div",
                viewTriples(),
                viewTripleEditor(),
                viewIBISDiagram("", "0")
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
t.setFileName(filePathFromParams)
t.loadFileContents()

m.mount(document.body, IBIS)
