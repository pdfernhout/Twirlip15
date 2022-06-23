"use strict"
/* eslint-disable no-console */
/* global m */

// defines m
import "../../vendor/mithril.js"

import { UUID } from "../../common/UUID.js"
import { Toast } from "../../common/Toast.js"
import { Triplestore } from "../../common/Triplestore.js"

function showError(error) {
    console.log("error", error)
    const errorMessage = error.message
        ? error.message
        : error
    Toast.toast(errorMessage)
}
window.addEventListener("error", event => showError(event))

const t = Triplestore(showError)

const menuButtonWithStyle = "button.ma1.f7"

let root = null

function getCurrentOutlineUUID() {
    return t.findLast("outliner:root", "currentOutline")
}

async function startup() {
    // If calling a second time, preserve copiedNodeRepresentation but clear cutNode as node triple data is in a different outline
    cutNode = null

    const filePathFromParams = decodeURI(window.location.pathname)
    t.setFileName(filePathFromParams)
    await t.loadFileContents()

    const currentOutline = getCurrentOutlineUUID()

    if (currentOutline) {
        root = new Node(currentOutline)
    }

    m.redraw()
}

function firstLine(text) {
    if (!text) return ""
    return text.split("\n")[0]
}

function convertText(textString) {
    const prefix = "text:"
    if (!textString.startsWith(prefix)) return ""
    return textString.substring(prefix.length)
}

class Node {

    constructor(uuid) {
        this.uuid = uuid
    }

    getContents() {
        return convertText(t.findLast(this.uuid, "contents") || "text:")
    }

    setContents(contents) {
        t.addTriple({a: this.uuid, b: "contents", c: "text:" + contents})
    }

    getFirstLine() {
        return firstLine(this.getContents())
    }

    getRestOfLines() {
        const contents = this.getContents()
        return contents.substring(firstLine(contents).length + 1)
    }

    isContentsMultiLine() {
        const contents = this.getContents()
        return firstLine(contents) !== contents
    }

    // This is a copy of children, so any changes to children need to be saved again
    getChildrenAsUUIDs() {
        const items = t.find(this.uuid, "child")
        return items
    }

    getChildrenAsNodes() {
        const uuidsForChildren = this.getChildrenAsUUIDs()
        if (!uuidsForChildren) return null
        return uuidsForChildren.map(uuid => new Node(uuid))
    }

    getParent() {
        return t.findLast(this.uuid, "parent")
    }

    setParent(parent) {
        t.addTriple({a: this.uuid, b: "parent", c: parent})
    }

    addChild(uuid) {
        t.addTriple({a: this.uuid, b: "child", c: uuid, o: "insert"})
        // new Node(uuid).setParent(this.uuid)
    }

    deleteChild(uuid) {
        t.addTriple({a: this.uuid, b: "child", c: uuid, o: "remove"})
    }
}

function addNode(parentNode) {
    const contents = prompt("contents?")
    if (contents) {
        // MAYBE: p.newTransaction("outliner/addNode")
        const node = new Node("outlinerNode:" + UUID.uuidv4())
        node.setContents(contents)
        node.setParent(parentNode.uuid)
        parentNode.addChild(node.uuid)
        // MAYBE: p.sendCurrentTransaction()
    }
}

function deleteNode(node) {
    const ok = true // confirm("cut " + node.getFirstLine() + "?")
    if (ok) {
        // MAYBE: p.newTransaction("outliner/deleteNode")
        const parent = node.getParent()
        if (parent) {
            new Node(parent).deleteChild(node.uuid)
            node.setParent("")
        }
        // MAYBE: p.sendCurrentTransaction()
    }
    return ok
}

const expandedNodes = {}
const expandedTexts = {}

function expandNode(node) {
    const uuid = node.uuid
    expandedNodes[uuid] = !expandedNodes[uuid]
}

function expandAllChildren(node) {
    const uuid = node.uuid
    if (expandedNodes[uuid]) {
        setExpanded(node, false)
    } else {
        setExpanded(node, true)
    }
}

// Recursive
function setExpanded(node, state) {
    const children = node.getChildrenAsNodes()

    let childMatch = false
    for (const child of children) {
        childMatch = setExpanded(child, state) || childMatch
    }

    if (filterText) {
        const contents = node.getContents()
        const re = new RegExp(filterText, "i")
        if (childMatch || re.test(contents)) {
            expandedNodes[node.uuid] = state
            expandedTexts[node.uuid] = state
            return true
        } else {
            expandedNodes[node.uuid] = false
            expandedTexts[node.uuid] = false
            return false
        }
    } else {
        expandedNodes[node.uuid] = state
        expandedTexts[node.uuid] = state
        return true
    }
}

// Recursive
function copyNodeRepresentation(node) {
    const newNode = { 
        uuid: node.uuid,
        contents: node.getContents(),
        children: node.getChildrenAsNodes().map(child => copyNodeRepresentation(child))
    }

    return newNode
}

// Recursive
function recreateNode(nodeRepresentation, parentNode) {
    const node = new Node("outlinerNode:" + UUID.uuidv4())
    node.setContents(nodeRepresentation.contents)
    node.setParent(parentNode.uuid)
    parentNode.addChild(node.uuid)
    for (const childRepresentation of nodeRepresentation.children) {
        recreateNode(childRepresentation, node)
    }
    return node
}

let showPopup = ""

let editedNode = ""
let cutNode = null
let copiedNodeRepresentation = null

let filterText = ""

// Recursive
function displayNode(node) {

    function showButton() {
        return m(menuButtonWithStyle, {
            onclick: () => {
                expandedTexts[node.uuid] = !expandedTexts[node.uuid]
                editedNode = ""
            }
        }, "Show")
    }

    function editButton() {
        return m(menuButtonWithStyle, { 
            onclick: () => {
                (editedNode === node.uuid) ?
                    editedNode = "" :
                    editedNode = node.uuid
                expandedTexts[node.uuid] = false
            }
        }, "Edit")
    }

    function evalButton() {
        return m(menuButtonWithStyle, { 
            onclick: () => {
                evalNodeContents(node)
            }
        }, "Eval")
    }

    function evalNodeContents(node) {
        const contents = node.getContents()
        eval(contents)
    }

    function cutButton() {
        return m(menuButtonWithStyle, {
            disabled: node.uuid === root.uuid,
            onclick: () => {
                if (deleteNode(node)) {
                    cutNode = node
                    copiedNodeRepresentation = copyNodeRepresentation(node)
                }
            }
        }, "Cut")
    }

    function copyButton() {
        return m(menuButtonWithStyle, {
            onclick: () => {
                cutNode = null
                copiedNodeRepresentation = copyNodeRepresentation(node)   
            }
        }, "Copy")
    }

    function pasteChildButton() {
        return m(menuButtonWithStyle, { 
            disabled: !cutNode && !copiedNodeRepresentation,
            onclick: () => {
                if (cutNode) {
                    // MAYBE: p.newTransaction("outliner/cutNode")
                    node.addChild(cutNode.uuid)
                    cutNode.setParent(node.uuid)
                    // MAYBE: p.sendCurrentTransaction()
                    cutNode = null
                    copiedNodeRepresentation = null
                } else if (copiedNodeRepresentation) {
                    // MAYBE: p.newTransaction("outliner/pasteNode")
                    recreateNode(copiedNodeRepresentation, node)
                    // MAYBE: p.sendCurrentTransaction()
                }
            }
        }, "Paste Child")
    }

    function compareNodeNames(a, b) {
        const aNodeName = a.getFirstLine() || ""
        const bNodeName = b.getFirstLine() || ""
        return aNodeName.localeCompare(bNodeName)
    }

    if (node === null) return "NULL"
    const children = node.getChildrenAsNodes()

    const isMultiLine = node.isContentsMultiLine()
    const isExpandable = children.length !== 0
    const isExpanded = isExpandable && expandedNodes[node.uuid]

    let sortedNodes = []
    if (isExpanded || filterText) {
        // As optimization, only calculate display for children if the node is expanded or filtering
        sortedNodes = children.sort(compareNodeNames).map(node => {
            return displayNode(node)
        })
        sortedNodes = sortedNodes.filter(item => !Array.isArray(item) || item.length !== 0)
    }

    let isContentMatch = false
    if (filterText) {
        const contents = node.getContents()
        const re = new RegExp(filterText, "i")
        isContentMatch = re.test(contents)
        if (!isContentMatch && !sortedNodes.length) return []
    }

    return m("div.ml3.mt1.mb1", { key: "node:" + node.uuid }, [
        isExpandable ? m("span.mr1.dib", {
            onclick: () => {
                expandNode(node)
                showPopup = ""
                editedNode = ""
            },
            style: "min-width: 0.5rem"
        }, isExpanded ? "▾" : "▸") : [m("span.mr1.dib", { style: "min-width: 0.5rem" }, "•")],
        m("span" + (isContentMatch ? ".b" : ""), 
            { 
                onclick: () => {
                    showPopup === node.uuid ? showPopup = "" : showPopup = node.uuid
                    editedNode = ""
                }
            },
            node.getFirstLine() || "[EMPTY]",
        ),
        isMultiLine ?  
            m("span.b", {
                onclick: () => {
                    expandedTexts[node.uuid] = !expandedTexts[node.uuid]
                    editedNode = ""
                }
            }, expandedTexts[node.uuid] ? m("span", { style: "visibility: hidden" }, " ...") : " ...") :
            [],
        showPopup === node.uuid ?
            // Use relative div inside absolute div so we can move popup meny up slightly
            m("div.dib.absolute", m("div.relative.bg-light-yellow.ml1", { style: "top: -0.30rem" }, [
                isMultiLine ? showButton() : [],
                editButton(),
                evalButton(),
                copyButton(),
                (node.uuid === root.uuid) ? [] : cutButton(),
                pasteChildButton(),
                m(menuButtonWithStyle, {onclick: addNode.bind(null, node, false)}, "Add Child"),
                isExpandable
                    ? [
                        m(menuButtonWithStyle, {onclick: () => expandNode(node)}, "Expand"),
                        m(menuButtonWithStyle, {onclick: () => expandAllChildren(node)}, "Expand All"),
                    ]
                    : []
            ])) : 
            [],
        (editedNode === node.uuid) ? [
            m("br"),
            m("textarea", { rows: 10, cols: 60,  value: node.getContents(), onchange: (event) => node.setContents(event.target.value) })
        ] : (isMultiLine && expandedTexts[node.uuid]) ? 
            m("div.ml3", { style: "white-space: pre-wrap" }, node.getRestOfLines()) :
            []

    ].concat(isExpanded ? 
        sortedNodes.length ? m("div", sortedNodes) : [] : 
        []
    ))
}

/*
function displayFormattedText(text) {
    const lines = text.split(/\r?\n/g)
    return lines.map(line => [line, m("br")])
}
*/

function displayOutliner() {
    return m("outliner", [
        m("div.ma2", {key: "filter"}, [
            "Filter:",
            m("input.w6.ml1.mr1", { value: filterText, onchange: (event) => filterText = event.target.value } ),
            "(regex)",
            m("button.ml1", { onclick: () => expandAllChildren(root) }, "Expand All")
        ]),
        displayNode(root)
    ])
}

function promptToCreateOutline() {
    const uuid = prompt("Start an outline with this UUID?", "outlinerNode:" + UUID.uuidv4())
    if (!uuid) return
    root = new Node(uuid)
    t.addTriple({a: "outliner:root", b: "currentOutline", c: uuid})
}

const NodeSystemViewer = {
    view: function() {
        return m(".main", [
            m("h1.ba.b--blue", { class: "title" }, "Twirlip15 Outliner"),
            t.getLoadingState().isFileLoaded
                ? getCurrentOutlineUUID()
                    ? displayOutliner()
                    : m("button.ma3", {onclick: promptToCreateOutline}, "No outline here yet. Click to start an outline.")
                : "Loading..."
        ])
    }
}

m.mount(document.body, NodeSystemViewer)

startup()
