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

function warnIfInvalid(type, newLabel) {
    if (newLabel === null) return true
    let valid = false
    if (newLabel === "") {
        alert("Label cannot be empty")
    } else if (type === "?" && !newLabel.includes("?")) {
        alert("New label for a question must contain a question mark (\"?\") preferably at the end.")
    } else if (type !== "?" && newLabel.includes("?")) {
        alert("Label for a non-question should not contain a question mark (\"?\").")
    } else {
        valid = true
    }
    return valid
}

function nameForType(type) {
    return {
        "?": "question",
        "*": "option",
        "+": "pro",
        "-": "con"
    }[type]
}

function editClicked(type, id) {
    const oldLabel = t.findLast(id, "label") || "Unlabelled"
    let valid = false
    let newLabel = null
    let labelForPrompt = oldLabel
    while (!valid) {
        newLabel = prompt("Edit label for " + nameForType(type) + ":", labelForPrompt)
        valid = warnIfInvalid(type, newLabel)
        labelForPrompt = newLabel
    }
    if (newLabel) {
        t.addTriple({
            a: id,
            b: "label",
            c: newLabel,
            o: "replace"
        }) 
    }
}

async function deleteClicked(type, childId, parentId) {
    const label = t.findLast(childId, "label") || "Unlabelled"
    if (!confirm("confirm delete " + nameForType(type) + " \"" + label + "\"?")) return
    await t.addTriple({
        a: parentId,
        b: type,
        c: childId,
        o: "remove"
    })
}

async function addItem(type, parentId) {
    let valid = false
    let newLabel = null
    let labelForPrompt = ""
    while (!valid) {
        newLabel = prompt("Label for new " + nameForType(type) + ":", labelForPrompt)
        valid = warnIfInvalid(type, newLabel)
        labelForPrompt = newLabel
    }
    if (newLabel) {
        const childId = Math.random()
        await t.addTriple({
            a: parentId,
            b: type,
            c: childId,
            o: "insert"
        })
        await t.addTriple({
            a: childId,
            b: "label",
            c: newLabel,
            o: "insert"
        }) 
    }
}

// recursive
function viewIBISDiagram(type, id, parent) {
    if (id === "") return m("div.ml4", "Missing id in IBIS diagram")
    // console.log("viewIBISDiagram", id, "label", t.find(id, "label") )
    return m("div.ml4",
        m("div.relative", { title: id, 
            onclick: () => { editedTriple.a = id } }, 
            (type === "+" || type === "-") && m("span.mr1", type),
            m("span" /* + (lastSelectedItem === id ? ".ba" : "") */, 
                { onclick: () => (lastSelectedItem === id)
                    ? lastSelectedItem = null 
                    : lastSelectedItem = id
                }, 
                t.findLast(id, "label") || "Unlabelled"
            ), 
            (lastSelectedItem === id) && m("span.absolute.bg-yellow.ml1.pa1.z-1",
                { style: {top: "-0.4rem"} },
                m("button.ml1", {onclick: () => deleteClicked(type, id, parent) }, "X"),
                m("button.ml1", {onclick: () => editClicked(type, id) }, "✎"),
                m("button.ml1", {onclick: () => addItem("?", id) }, "?"),
                (type === "?") && m("button.ml1", {onclick: () => addItem("!", id) }, "*"),
                (type === "!") && m("button.ml1", {onclick: () => addItem("+", id) }, "+"),
                (type === "!") && m("button.ml1", {onclick: () => addItem("-", id) }, "-")
            )
        ),
        t.find(id, "+").map(childId => viewIBISDiagram("+", childId, id)),
        t.find(id, "-").map(childId => viewIBISDiagram("-", childId, id)),
        t.find(id, "!").map(childId => viewIBISDiagram("!", childId, id)),
        t.find(id, "?").map(childId => viewIBISDiagram("?", childId, id)),
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
                rootId && viewIBISDiagram("?", rootId, null),
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
