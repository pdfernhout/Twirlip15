/* global m, showdown */
import "../../vendor/mithril.js"
import { Triplestore } from "../../common/Triplestore.js"
import { menuTopBar, menuButton } from "../../common/menu.js"
import { helpText } from "./ibis-help.js"
import "../../vendor/showdown.js"
import { ModalInputView, modalAlert, modalConfirm, modalPrompt, customModal } from "../../common/ModalInputView.js"

// // Experimenting with idea of schemas and Pointrel triples -- what might a schema look like?
// // It does add clarity to seeing what form the application's data is supposed to have.
// // eslint-disable-next-line no-unused-vars
// const ibisItemSchema = {
//     // type: "com.twirlip.IBISItem",
//     type: "IBIS.Item",
//     version: "1",
//     fields: {
//         id: "string",
//         _id: "string",
//         _schemaVersion: "string",
//         _revision: "string",
//         type: { type: "enum", options: ["question", "answer", "pro", "con"] },
//         label: "string",
//         attachedTo: "IBIS.Item",
//         // IBISItem:12345678 _schemaVersion 1
//         // IBISItem:12345678 _schemaHash sha256-hash-of-schema
//         deleted: "boolean",
//         deletedX: { type: "boolean" },
//         deletedY: Boolean,
//         // extra: "json"
//     }
// }

// eslint-disable-next-line no-unused-vars
function validateFieldValue(value, fieldSchema) {
    // TODO: enforce constraints
    return true
}

let errorMessage = ""

let lastSelectedItem = null

let isHelpDisplayed = false

function showError(error) {
    if (error.message) {
        errorMessage = error.message
        throw error
    } else {
        errorMessage = error
    }
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
    // With a schema:
    // return new IBISNode(id).type
    let type = "" + t.findLast(id, "IBIS.Field:type")
    if (type.startsWith("IBIS.Type:")) type = type.substring("IBIS.Type:".length)
    return type
}

function labelForNode(id) {
    // With a schema:
    // return new IBISNode(id).label
    let label = "" + t.findLast(id, "IBIS.Field:label")
    if (label.startsWith("string:")) label = label.substring("string:".length)
    if (!label) label = "Unlabelled"
    return label
}

function childrenForNode(id) {
    // With a schema:
    // return new IBISNode(id).attachedTo
    return t.find(null, "IBIS.Field:attachedTo", id)
}

function rootForTree() {
    return t.last((t.find("IBIS.Root:root", "IBIS.Field:value")))
}

// Copied from triples.js
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

async function editClicked(id) {
    const type = typeForNode(id)
    const oldLabel = labelForNode(id)
    let valid = false
    let newLabel = null
    let newType = type
    let labelForPrompt = oldLabel
    while (!valid) {
        newLabel = labelForPrompt
        const ok = await customModal((resolve) => {
            return m("div",
                m("h3", "Edit node " +  id),
                m("label.flex.items-center", 
                    m("span.mr2", "Label: "),
                    m("input.flex-grow-1", {value: newLabel, oninput: event => newLabel = event.target.value}),
                ),
                m("div.pa2"),
                m("label",
                    "Type: ",
                    viewSelect(["question", "answer", "pro", "con"], newType, value => newType = value)
                ),
                m("div.pa2"),
                m("div.ma2.flex.justify-end", 
                    m("button", { onclick: () => resolve(false)}, "Cancel"),
                    m("button.ml2", { onclick: () => resolve(true)}, "OK")
                )
            )
        })
        if (!ok) return
        valid = await warnIfInvalid(newType, newLabel)
        labelForPrompt = newLabel
    }
    if (newLabel && newLabel !== oldLabel) {
        await t.addTriple({
            a: id,
            b: "IBIS.Field:label",
            c: "string:" + newLabel,
            o: "replace"
        }) 
    }
    if (type !== newType) {
        await t.addTriple({
            a: id,
            b: "IBIS.Field:type",
            c: "IBIS.Type:" + newType,
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
        b: "IBIS.Field:attachedTo",
        c: "",
        o: "replace"
    })
    await t.addTriple({
        a: id,
        b: "IBIS.Field:deleted",
        c: "boolean:true",
        o: "insert"
    })
}

async function addItem(type, parentId) {
    let valid = false
    let newLabel = null
    let labelForPrompt = ""
    while (!valid) {
        newLabel = await modalPrompt("Label for new " + type + ":", labelForPrompt)
        valid = await warnIfInvalid(type, newLabel)
        labelForPrompt = newLabel
    }
    if (newLabel) {
        const childId = "IBIS.Node:" + ("" + Math.random()).split(".")[1]
        // With a schema:
        // const node = new SchematizedObject("IBIS.Node", childId)
        // node.type = type
        await t.addTriple({
            a: childId,
            b: "IBIS.Field:type",
            c: "IBIS.Type:" + type,
            o: "insert"
        })
        // With a schema:
        // node.label = newLabel
        await t.addTriple({
            a: childId,
            b: "IBIS.Field:label",
            c: "string:" + newLabel,
            o: "insert"
        })
        // With a schema:
        // node.attachedTo = parentId
        await t.addTriple({
            a: childId,
            b: "IBIS.Field:attachedTo",
            c: parentId,
            o: "insert"
        })
        return childId
    }
    return null
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
    const rootId = rootForTree()
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

async function createNewFile() {
    const ok = await modalConfirm("Create new file?\n\nThe file will be called:\n" + filePathFromParams.split("/").pop())
    if (!ok) return
    await t.createNewFile(async () => {
        await modalAlert("File created OK")
        await t.loadFileContents()
        m.redraw()
    })
}

async function makeInitialQuestion() {
    const id = await addItem("question", "")
    if (id !== null) {
        // Need special root object with different schema
        // root.value = id
        await t.addTriple({
            a: "IBIS.Root:root",
            b: "IBIS.Field:value",
            c: id,
            o: "insert"
        })
    }
}

const IBISApp = {
    view: () => {
        const rootId = rootForTree()
        const loadingState = t.getLoadingState()
        return m("div",
            viewMenu(),
            m(ModalInputView),
            m("div.ma2",
                errorMessage && m("div.red.fixed.bg-light-gray.pa2.z-1", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
                loadingState.isFileLoading && m("div",
                    "Loading..."
                ),
                loadingState.isFileLoaded && m("div",
                    !rootId && m("div",
                        "To display an IBIS diagram, a root value must be set with an initial node id.",
                        m("button.ma2", { onclick: makeInitialQuestion }, "Ask initial question")
                    ),
                    rootId && viewIBISDiagram(rootId),
                ),
                !errorMessage && !loadingState.isFileLoading && !loadingState.isFileLoaded && 
                    m("div",
                        "Problem loading file",
                        m("button.ma2", { onclick: createNewFile }, "Create new file")),
                viewHelp()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
t.setFileName(filePathFromParams)
t.loadFileContents()

m.mount(document.body, IBISApp)

// // Experiments with a schema for using defined classes of objects with triplestore:

// // Try Proxy...

// const proxyHandler = {
//     get: async function(target, property) {
//         const fieldSchema = target.schema.fields[property]
//         console.log("fieldSchema", property, fieldSchema)
//         if (!fieldSchema) throw new Error("Unexpected field name: " + property)
//         return await t.findLast(target.id, property)
//     },

//     set: async function(target, property, value) {
//         const fieldSchema = target.schema.fields[property]
//         if (!fieldSchema) throw new Error("Unexpected field name: " + property)
//         if (!validateFieldValue(value, fieldSchema)) throw new Error("Unexpected value for field: " + property + " of: " + JSON.stringify(value))
//         await t.addTriple({
//             a: target.id,
//             b: property,
//             c: value,
//             o: "replace"
//         })
//     }
// }

// const test = new Proxy({id: "0", schema: ibisItemSchema}, proxyHandler)

// setTimeout(async () => console.log("test.type", await test.type), 1000)
// setTimeout(async () => console.log("test.missing", await test.missing), 1000)
// setTimeout(async () => console.log("test.label", await test.label), 1000)
// // Problem where you can't meaningfully await on an assignment --
// // which could eventually lead to errors from overlapping file operations.
// // This implies needing an approach like in a previous Pointrel version where no need to wait
// // as file changes are done in the background and an error is only signalled if problem later.
// setTimeout(async () => console.log("test.label", await (test.label = "What to work on next? " + Math.random())), 1000)

// // eslint-disable-next-line no-unused-vars
// class SchematizedTriplestoreItem {
//     constructor(schema, triplestore, id) {
//         this.schema = schema
//         this.triplestore = triplestore
//         this.id = id
//     }

//     async getField(field) {
//         const fieldSchema = this.schema[field]
//         if (!fieldSchema) throw new Error("Unexpected field name: " + field)
//         return await this.triplestore.findLast(this.id, field)
//     }

//     async setField(field, value) {
//         const fieldSchema = this.schema[field]
//         if (!fieldSchema) throw new Error("Unexpected field name: " + field)
//         if (!validateFieldValue(value, fieldSchema)) throw new Error("Unexpected value for field: " + field + " of: " + JSON.stringify(value))
//         await this.triplestore.addTriple({
//             a: this.id,
//             b: field,
//             c: value,
//             o: "replace"
//         })
//     }
// }
