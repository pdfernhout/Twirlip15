/* global m, showdown */
import "../../vendor/mithril.js"
import { Triplestore } from "../../common/Triplestore.js"
import { menuTopBar, menuButton } from "../../common/menu.js"
import { helpText } from "./ibis-help.js"
import "../../vendor/showdown.js"

let errorMessage = ""

let lastSelectedItem = null

let isHelpDisplayed = false

function showError(error) {
    errorMessage = error
}

const t = Triplestore(showError)

function warnIfInvalid(type, newLabel) {
    if (newLabel === null) return true
    let valid = false
    if (newLabel === "") {
        alert("Label cannot be empty")
    } else if (type === "question" && !newLabel.includes("?")) {
        alert("New label for a question must contain a question mark (\"?\") preferably at the end.")
    } else if (type !== "question" && newLabel.includes("?")) {
        alert("Label for a non-question should not contain a question mark (\"?\").")
    } else {
        valid = true
    }
    return valid
}

function editClicked(id) {
    const type = t.findLast(id, "type")
    const oldLabel = t.findLast(id, "label") || "Unlabelled"
    let valid = false
    let newLabel = null
    let labelForPrompt = oldLabel
    while (!valid) {
        newLabel = prompt("Edit label for " + type + ":", labelForPrompt)
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

async function deleteClicked(id) {
    const type = t.findLast(id, "type")
    const label = t.findLast(id, "label") || "Unlabelled"
    if (!confirm("confirm delete " + type + " \"" + label + "\"?")) return
    await t.addTriple({
        a: id,
        b: "attachedTo",
        c: "",
        o: "replace"
    })
    await t.addTriple({
        a: id,
        b: "deleted",
        c: true,
        o: "insert"
    })
}

async function addItem(type, parentId) {
    let valid = false
    let newLabel = null
    let labelForPrompt = ""
    while (!valid) {
        newLabel = prompt("Label for new " + type + ":", labelForPrompt)
        valid = warnIfInvalid(type, newLabel)
        labelForPrompt = newLabel
    }
    if (newLabel) {
        const childId = Math.random()
        await t.addTriple({
            a: childId,
            b: "type",
            c: type,
            o: "insert"
        })
        await t.addTriple({
            a: childId,
            b: "label",
            c: newLabel,
            o: "insert"
        })
        await t.addTriple({
            a: childId,
            b: "attachedTo",
            c: parentId,
            o: "insert"
        })
    }
}

function indent(indentLevel) {
    return "    ".repeat(indentLevel)
}

// recursive
function exportIBISDiagram(indentLevel, id) {
    if (id === "") return indent(indentLevel) + "Missing id in IBIS diagram\n"
    const type = t.findLast(id, "type")
    let result = indent(indentLevel) +
        ((type === "pro") ? ("+ ") : "") +
        ((type === "con") ? ("- ") : "") +
        (t.findLast(id, "label") || "Unlabelled") + 
        "\n"
    const childIndentLevel = indentLevel + 1
    t.find(null, "attachedTo", id).map(childId => result += exportIBISDiagram(childIndentLevel, childId))
    return result
}

// recursive
function viewIBISDiagram(id) {
    if (id === "") return m("div.ml4", "Missing id in IBIS diagram")
    const type = t.findLast(id, "type")
    return m("div.ml4",
        m("div.relative",
            { onclick: () => (lastSelectedItem === id)
                ? lastSelectedItem = null 
                : lastSelectedItem = id
            }, 
            (type === "pro") && m("span.mr1", "+"),
            (type === "con") && m("span.mr1", "-"),
            m("span",
                t.findLast(id, "label") || "Unlabelled"
            ), 
            (lastSelectedItem === id) && m("span.absolute.bg-yellow.ml1.pa1.z-1",
                { style: {top: "-0.4rem"} },
                (type === "question") && m("button.ml1", {onclick: () => addItem("option", id) }, "*"),
                (type === "option") && m("button.ml1", {onclick: () => addItem("pro", id) }, "+"),
                (type === "option") && m("button.ml1", {onclick: () => addItem("con", id) }, "-"),
                m("button.ml1", {onclick: () => addItem("question", id) }, "?"),
                m("button.ml1", {onclick: () => editClicked(id) }, "✎"),
                m("button.ml1", {onclick: () => deleteClicked(id) }, "X")
            )
        ),
        t.find(null, "attachedTo", id).map(childId => viewIBISDiagram(childId)),
    )
}

function exportMenuAction() {
    console.log("exportMenuAction")
    const rootId = t.last((t.find("root", "value")))
    if (!rootId) return alert("No IBIS root")
    const result = exportIBISDiagram(0, rootId)
    console.log(result)
    alert("Export results logged to console")
}

function viewMenu() {
    return menuTopBar([
        menuButton("Export", exportMenuAction),
        menuButton("Help", () => isHelpDisplayed = !isHelpDisplayed)
    ])
}

function viewHelp() {
    const converter = new showdown.Converter({simplifiedAutoLink: true})
    const htmlForHelpText = converter.makeHtml(helpText)
    return isHelpDisplayed && m("div.pa2.bg-light-gray",
        m("div.mt1", m("span", {onclick: () => isHelpDisplayed = false }, "X "), m("span", "---- Dialogue Mapping with IBIS Help ----")),
        m("div.pl3.pr3.pb3", m.trust(htmlForHelpText))
    )
}

const IBISApp = {
    view: () => {
        const rootId = t.last((t.find("root", "value")))
        return m("div",
            viewMenu(),
            m("div.ma2",
                errorMessage && m("div.red.fixed.bg-light-gray.pa2", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
                !t.getLoadingState().isFileLoaded && m("div",
                    "Loading..."
                ),
                t.getLoadingState().isFileLoaded && m("div",
                    !rootId && m("div", "To display an IBIS diagram, a root value must be set with an initial node id."),
                    rootId && viewIBISDiagram(rootId),
                ),
                viewHelp()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
t.setFileName(filePathFromParams)
t.loadFileContents()

m.mount(document.body, IBISApp)
