/* global m */
import "../../vendor/mithril.js"
import { Triplestore } from "../../common/Triplestore.js"

let showIgnoredTriples = true

let errorMessage = ""

function showError(error) {
    errorMessage = error
}

const t = Triplestore(showError)

function viewTriple(triple) {
    return m("tr", 
        m("td", { onclick: () => {
            editedTriple = {a: triple.a, b: triple.b, c: triple.c, o: triple.o || "replace"} 
        } }, (triple.ignore ? "−" : "+") + triple.index),
        m("td", triple.a),
        m("td", triple.b),
        m("td", triple.c),
        m("td", triple.o),
    )
}

function cleanup(triple) {
    return {
        a: triple.a.trim(),
        b: triple.b.trim(),
        c: triple.c.trim(),
    }
}

function viewTriples() {
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
        m("tbody", t.filterTriples(cleanup(filterTriple), showIgnoredTriples).map(triple => viewTriple(triple)))
    )
}

let editedTriple = {a: "", b: "", c: "", o: "replace"}

function viewTripleEditorField(fieldName) {
    return m("div.ml2",
        m("span", fieldName.toUpperCase() + ":"),
        m("input", {
            value: editedTriple[fieldName], 
            onchange: event => editedTriple[fieldName] = event.target.value
        })
    )
}

function viewCheckbox(label, value, callback) {
    return m("label.ml1", 
        m("input[type=checkbox].mr1", {
            checked: value,
            onclick: event => callback(event.target.checked)
        }),
        label
    )
}

function viewSelect(options, value, callback) {
    return m("select", { value, onchange: event => callback(event.target.value) },
        options.map(option => {
            if (option.label) {
                return m("option", { value: option.value }, option.label)
            } else {
                return m("option", { value: option }, option)
            }
        })
    )
}

const tripleOperations = ["replace", "insert", "remove", "clear"]

function viewTripleEditor() {
    return m("div.mt2", 
        m("div", "New Triple"),
        viewTripleEditorField("a"),
        viewTripleEditorField("b"),
        viewTripleEditorField("c"),
        m("div", viewSelect(tripleOperations, editedTriple.o, newValue => editedTriple.o = newValue)),
        m("button", {
            onclick: () => {
                if (!editedTriple.a || !editedTriple.b) {
                    showError("triples must have a an b fields as non-empty strings")
                    return
                }
                t.addTriple(editedTriple)
                editedTriple = {a: "", b: "", c: "", o: "insert"}
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

const TriplesApp = {
    view: () => {
        return m("div.ma2",
            errorMessage && m("div.red.fixed.bg-light-gray.pa2", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            !t.getLoadingState().isFileLoaded && m("div",
                "Loading..."
            ),
            t.getLoadingState().isFileLoaded && m("div",
                viewTripleEditor(),
                m("hr"),
                m("div",
                    viewCheckbox("Show ignored triples", showIgnoredTriples, () => showIgnoredTriples = !showIgnoredTriples),
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
