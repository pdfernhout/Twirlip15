/* global m */
import "../../vendor/mithril.js"
import { Triplestore } from "../../common/Triplestore.js"

let showIgnoredTriples = true

let errorMessage = ""

let lastSelectedItem = null

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

function editClicked(id) {
    const oldLabel = t.findLast(id, "label") || "Unlabelled"
    const newLabel = prompt("New label for " + id + " ?", oldLabel)
    if (newLabel) {
        t.addTriple({
            a: id,
            b: "label",
            c: newLabel,
            o: "replace"
        }) 
    }
}

function deleteClicked(id) {
    // Need to figure out parent or have passed in
    alert("delete not implemented yet: " + id)
}

function addItem(type, parentId) {
    const newLabel = prompt("Label for new [" + type + "] ?", "")
    if (newLabel) {
        const childId = Math.random()
        t.addTriple({
            a: parentId,
            b: type,
            c: childId,
            o: "insert"
        })
        t.addTriple({
            a: childId,
            b: "label",
            c: newLabel,
            o: "insert"
        }) 
    }
}

// recursive
function viewIBISDiagram(type, id) {
    if (id === "") return m("div.ml4", "Missing id in IBIS diagram")
    // console.log("viewIBISDiagram", id, "label", t.find(id, "label") )
    return m("div.ml4",
        m("div", { title: id, 
            onclick: () => { editedTriple.a = id } }, 
            m("span.mr1", type),
            m("span" /* + (lastSelectedItem === id ? ".ba" : "") */, 
                { onclick: () => lastSelectedItem = id }, 
                t.findLast(id, "label") || "Unlabelled"
            ), 
            (lastSelectedItem === id) && m("span",
                m("button.ml1", {onclick: () => deleteClicked(id) }, "X"),
                m("button.ml1", {onclick: () => editClicked(id) }, "✎"),
                m("button.ml1", {onclick: () => addItem("?", id) }, "?"),
                (type === "?") && m("button.ml1", {onclick: () => addItem("*", id) }, "*"),
                (type === "*") && m("button.ml1", {onclick: () => addItem("+", id) }, "+"),
                (type === "*") && m("button.ml1", {onclick: () => addItem("-", id) }, "-")
            )
        ),
        t.find(id, "+").map(childId => viewIBISDiagram("+", childId)),
        t.find(id, "-").map(childId => viewIBISDiagram("-", childId)),
        t.find(id, "!").map(childId => viewIBISDiagram("*", childId)),
        t.find(id, "?").map(childId => viewIBISDiagram("?", childId)),
    )
}

const TriplesApp = {
    view: () => {
        const rootId = t.last((t.find("root", "value")))
        // console.log("rootId", rootId)
        return m("div.ma2",
            errorMessage && m("div.red.fixed.bg-light-gray.pa2", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            !t.getLoadingState().isFileLoaded && m("div",
                "Loading..."
            ),
            t.getLoadingState().isFileLoaded && m("div",
                !rootId && m("div", "To display an IBIS diagram, a root value must be set with an initial node id."),
                rootId && viewIBISDiagram("?", rootId),
                m("hr"),
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
