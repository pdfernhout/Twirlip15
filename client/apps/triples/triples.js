/* global m */
import "../../vendor/mithril.js"
import { Triplestore } from "../../common/Triplestore.js"
import { viewSelect } from "../../common/menu.js"

let showIgnoredTriples = false
let showTriplesInReverseOrder = true

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

function viewTriple(triple) {
    return m("tr", 
        m("td", { onclick: () => {
            filterTriple = {a: triple.a, b: triple.b, c: triple.c, o: triple.o || "replace"} 
        } }, (triple.ignore ? "−" : "+") + triple.index),
        m("td", {
            onclick: () => filterTriple.a = triple.a
        }, triple.a),
        m("td", {
            onclick: () => filterTriple.b = triple.b
        }, triple.b),
        m("td", {
            onclick: () => filterTriple.c = triple.c
        }, triple.c),
        m("td", {
            onclick: () => filterTriple.o = triple.o
        }, triple.o),
    )
}

function cleanup(triple) {
    return {
        a: ("" + triple.a).trim(),
        b: ("" + triple.b).trim(),
        c: ("" + triple.c).trim(),
    }
}

function viewTriples() {
    const triples = t.filterTriples(cleanup(filterTriple), showIgnoredTriples)
    if (showTriplesInReverseOrder) triples.reverse()
    return m("table",
        m("thead", 
            m("tr",
                m("th", ""),
                m("th", "A"),
                m("th", "B"),
                m("th", "C"),
                m("th", "O"),
            ),
            viewTripleFilter()
        ),
        m("tbody", triples.map(triple => viewTriple(triple)))
    )
}

function viewCheckbox(label, value, callback) {
    return m("label.ml3", 
        m("input[type=checkbox].mr2", {
            checked: value,
            onclick: event => callback(event.target.checked)
        }),
        label
    )
}

const tripleOperations = ["replace", "insert", "remove", "clear"]

let filterTriple = {a: "", b: "", c: ""}

function viewTripleFilterField(fieldName, extraClassForTD="", extraClassForInput="") {
    return m("td" + extraClassForTD,
        m("input" + extraClassForInput, {
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
        viewTripleFilterField("c", ".w-100", ".w-99"),
        m("td", viewSelect(tripleOperations, filterTriple.o, newValue => filterTriple.o = newValue)),
        m("td", m("button", {
            onclick: () => {
                if (!filterTriple.a || !filterTriple.b) {
                    showError("triple must have a and b fields as non-empty strings")
                    return
                }
                if (!filterTriple.o) {
                    showError("triple must have operation field specified")
                    return
                }
                t.addTriple(filterTriple)
                // filterTriple = {a: "", b: "", c: "", o: "insert"}
            }
        }, "Add")),
    )
}

const TriplesApp = {
    view: () => {
        return m("div.ma2",
            errorMessage && m("div.red.fixed.bg-light-gray.pa2.z-1", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            !t.getLoadingState().isFileLoaded && m("div",
                "Loading..."
            ),
            t.getLoadingState().isFileLoaded && m("div",
                m("div",
                    viewCheckbox("Show ignored triples", showIgnoredTriples, () => showIgnoredTriples = !showIgnoredTriples),
                    viewCheckbox("Show triples in reverse order", showTriplesInReverseOrder, () => showTriplesInReverseOrder = !showTriplesInReverseOrder),
                    m("button.ml3", { onclick: () => filterTriple = {a: "", b: "", c: ""} }, "Clear filter")
                ),
                viewTriples()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
t.setFileName(filePathFromParams)
t.loadFileContents()

m.mount(document.body, TriplesApp)
