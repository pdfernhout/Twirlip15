/* global m, showdown */
import "../../vendor/mithril.js"
import { Triplestore } from "../../common/Triplestore.js"
import { menuTopBar, menuButton } from "../../common/menu.js"
import { helpText } from "./ibis-help.js"
import "../../vendor/showdown.js"
import { ModalInputView, modalAlert, modalConfirm, modalPrompt } from "../../common/ModalInputView.js"

let errorMessage = ""

let lastSelectedItem = null

let isHelpDisplayed = false

function showError(error) {
    errorMessage = error
}

const t = Triplestore(showError)

async function warnIfInvalid(type, newLabel) {
    if (newLabel === null) return true
    let valid = false
    if (newLabel === "") {
        await modalAlert("Label cannot be empty")
    } else if (type === "question" && !newLabel.includes("?")) {
        const confirmResult = await modalConfirm("New label for a question should contain a question mark (\"?\") preferably at the end.\n\nProceed anyway?")
        if (confirmResult) valid = true
    } else if (type !== "question" && newLabel.includes("?")) {
        const confirmResult = await modalConfirm("Label for a non-question should not contain a question mark (\"?\").\n\nProceed anyway?")
        if (confirmResult) valid = true
    } else {
        valid = true
    }
    return valid
}

function typeForNode(id) {
    return t.findLast(id, "type")
}

function labelForNode(id) {
    return ("" + t.findLast(id, "label")) || "Unlabelled"
}

function childrenForNode(id) {
    return t.find(null, "attachedTo", id)
}

async function editClicked(id) {
    const type = typeForNode(id)
    const oldLabel = labelForNode(id)
    let valid = false
    let newLabel = null
    let labelForPrompt = oldLabel
    while (!valid) {
        newLabel = await modalPrompt("Edit label for " + type + ":", labelForPrompt)
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
    const type = typeForNode(id)
    const label = labelForNode(id)
    if (!await modalConfirm("confirm delete " + type + " \"" + label + "\"?")) return
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
        newLabel = await modalPrompt("Label for new " + type + ":", labelForPrompt)
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

function typeOrder(id) {
    const type = typeForNode(id)
    return {
        "pro": 1,
        "con": 2,
        "option": 3,
        "question": 4,
    }[type] || 0
}

function sortChildren(children) {
    children.sort((a, b) => {
        const typeOrderA = typeOrder(a)
        const typeOrderB = typeOrder(b)
        if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB
        return labelForNode(a).localeCompare(labelForNode(b))
    })
}

// recursive
function exportIBISDiagram(indentLevel, id) {
    if (id === "") return indent(indentLevel) + "Missing id in IBIS diagram\n"
    const type = typeForNode(id)
    const children = childrenForNode(id)
    sortChildren(children)
    let result = indent(indentLevel) +
        ((type === "pro") ? ("+ ") : "") +
        ((type === "con") ? ("- ") : "") +
        labelForNode(id) + 
        "\n"
    const childIndentLevel = indentLevel + 1
    children.map(childId => result += exportIBISDiagram(childIndentLevel, childId))
    return result
}

// recursive
function viewIBISDiagram(id) {
    if (id === "") return m("div.ml4", "Missing id in IBIS diagram")
    const type = typeForNode(id)
    const children = childrenForNode(id)
    sortChildren(children)
    return m("div.ml4",
        m("div.relative",
            { onclick: () => (lastSelectedItem === id)
                ? lastSelectedItem = null 
                : lastSelectedItem = id
            }, 
            (type === "pro") && m("span.mr1", "+"),
            (type === "con") && m("span.mr1", "-"),
            m("span",
                labelForNode(id)
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
        children.map(childId => viewIBISDiagram(childId)),
    )
}

async function exportMenuAction() {
    console.log("exportMenuAction")
    const rootId = t.last((t.find("root", "value")))
    if (!rootId) return await modalAlert("No IBIS root")
    const result = exportIBISDiagram(0, rootId)
    console.log(result)
    await modalAlert("Export results logged to console")
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
        m("div.mt1", m("span", {onclick: () => isHelpDisplayed = false }, "X "), m("span", "---- What is some useful information about Dialogue Mapping with IBIS? ----")),
        m("div.pl3.pr3.pb3", m.trust(htmlForHelpText))
    )
}

const IBISApp = {
    view: () => {
        const rootId = t.last((t.find("root", "value")))
        return m("div",
            viewMenu(),
            m(ModalInputView),
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
