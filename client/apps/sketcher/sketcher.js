"use strict"
/* eslint-disable no-console */

/* global m */

// defines m
import "../../vendor/mithril.js"

import { ItemMap, drawPolylines } from "../../common/ItemMap.js"

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

let sketch = null

let sketchViewportHeight = 500

const itemMap = ItemMap()

function getCurrentSketchUUID() {
    return t.findLast("sketcher:root", "currentSketch")
}

function raiseItem() {
    itemMap.getSelectedItems().forEach(item => item.setLayer(item.getLayer() + 1))
}

function lowerItem() {
    itemMap.getSelectedItems().forEach(item => item.setLayer(item.getLayer() - 1))
}

function deleteItem() {
    const selectedItems = itemMap.getSelectedItems()
    if (!selectedItems.length) return
    if (!confirm("Delete " + selectedItems.length + " item(s)?")) return
    selectedItems.forEach(item => sketch.deleteItem(item))
    itemMap.deselectAllItems()
}

function insertLinksIntoText(text) {
    const result = []
    text.split(" ").forEach((each) => {
        if (result.length) {
            result.push(" ")
        }
        if (each.toLowerCase().startsWith("http")) {
            result.push(each)
            result.push(m("a", {"xlink:href": each, target: "_blank"}, " [🔗]"))
        } else {
            result.push(each)
        }
    })
    return result
}

function splitText(text, bounds) {
    const result = []
    const height = 18
    let y = bounds.y1 + height
    text.split("\n").forEach((each) => {
        result.push(m("tspan", {
            x: bounds.x1,
            y: y
        }, insertLinksIntoText(each)))
        y += height
    })
    return result
}

function convertNumber(numberString) {
    return parseFloat(numberString)
}

function convertJSON(jsonString) {
    return JSON.parse(jsonString)
}

class ObjectInTriplestore {
    constructor(triplestore, uuid, type) {
        this.triplestore = triplestore
        this.uuid = uuid || UUID.forType(type)
    }

    getField(fieldName, type, defaultValue) {
        const value = this.triplestore.findLast(this.uuid, fieldName)
        // Could check type against stored ct type
        if (value === null) return defaultValue
        if (type === "text") return value
        if (type === "number") return convertNumber(value)
        if (type === "json") return convertJSON(value)
        return value
    }

    setField(fieldName, type, value) {
        if (value === undefined) {
            throw new Error("value should not be undefined for " + fieldName + " with type " + type)
        }
        let textToStore
        if (type === "json") {
            textToStore = JSON.stringify(value)
        } else {
            textToStore = String(value)
        }
        this.triplestore.addTriple({a: this.uuid, b: fieldName, c: textToStore, ct: type, o: "replace"})
    }

    getFieldSet(fieldName, itemCallback) {
        const items = this.triplestore.find(this.uuid, fieldName)
        if (itemCallback) return items.map(itemCallback)
        return items
    }

    insertIntoFieldSet(fieldName, itemUUID) {
        this.triplestore.addTriple({a: this.uuid, b: fieldName, c: itemUUID, o: "insert"})
    }

    removeFromFieldSet(fieldName, itemUUID) {
        this.triplestore.addTriple({a: this.uuid, b: fieldName, c: itemUUID, o: "remove"})
    }

    clearFieldSet(fieldName) {
        this.triplestore.addTriple({a: this.uuid, b: fieldName, c: null, o: "clear"})
    }  
}

class Item extends ObjectInTriplestore {
    constructor(uuid) {
        super(t, uuid, "sketchItem")
    }

    getType() {
        return this.getField("type", "sketchItemType")
    }

    setType(type) {
        this.setField("type", "sketchItemType", type)
    }

    getBounds() {
        let bounds = this.getField("bounds", "json", {})
        if (!bounds || (!bounds.x1 && !bounds.y1 && !bounds.x2 && !bounds.y2)) {
            bounds =  { x1: 0, y1: 0, x2: 20, y2: 20 }
        }
        return bounds
    }

    setBounds(bounds) {
        this.setField("bounds", "json", bounds)
    }

    getLayer() {
        return this.getField("layer", "number", 1)
    }

    setLayer(layer) {
        this.setField("layer", "number", layer)
    }

    getText() {
        return this.getField("text", "text", "")
    }

    setText(text) {
        this.setField("text", "text", text)
    }

    getStroke() {
        return this.getField("stroke", "cssStroke", "#006600")
    }

    setStroke(stroke) {
        this.setField("stroke", "cssStroke", stroke)
    }

    getStrokeWidth() {
        return this.getField("strokeWidth", "cssStrokeWidth", "1")
    }

    setStrokeWidth(width) {
        this.setField("strokeWidth", "cssStrokeWidth", width)
    }

    getFill() {
        return this.getField("fill", "cssColor", "#00cc00")
    }

    setFill(text) {
        this.setField("fill", "cssColor", text)
    }

    // To support sketch of segments of polylines
    getExtraData() {
        return this.getField("extraData", "json", null)
    }

    setExtraData(extraData) {
        this.setField("extraData","json", extraData)
    }

    getArrows() {
        return this.getField("arrows", "arrowsType", "none")
    }

    // none, start, end, both
    setArrows(arrows) {
        this.setField("arrows", "arrowsType", arrows)
    }

    // dragOffset and dragHandleName may both be undefined -- used for drawing while dragging
    draw(dragOffset, dragHandleName) {
        const type = this.getType()

        let bounds = this.getBounds()
        if (dragHandleName) {
            bounds = itemMap.copyRectWithHandleDelta(bounds, dragHandleName, dragOffset, type === "line")
        } else if (dragOffset) {
            bounds = itemMap.copyRectWithDelta(bounds, dragOffset)
        }

        if (type === "rectangle") {
            return m("rect", {
                key: this.uuid,
                x: bounds.x1,
                y: bounds.y1,
                // Set a minimum size for the rectangle for now
                width: Math.max(10, bounds.x2 - bounds.x1),
                height: Math.max(10, bounds.y2 - bounds.y1), 
                style: { 
                    stroke: this.getStroke(),
                    "stroke-width": this.getStrokeWidth(), 
                    fill: this.getFill()
                }, 
                onpointerdown: event => itemMap.mouseDownInItem(this, event)
            })
        } else if (type === "circle") {
            return m("circle", {
                key: this.uuid,
                cx: bounds.x1 + Math.round((bounds.x2 - bounds.x1) / 2),
                cy: bounds.y1 + Math.round((bounds.y2 - bounds.y1) / 2),
                r: Math.round(Math.max(20, Math.min(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1)) / 2), 
                style: {
                    stroke: this.getStroke(),
                    "stroke-width": this.getStrokeWidth(), 
                    fill: this.getFill()
                }, 
                onpointerdown: event => itemMap.mouseDownInItem(this, event)
            })
        } else if (type === "line") {
            const arrows = this.getArrows()
            return m("line", {
                key: this.uuid,
                x1: bounds.x1,
                y1: bounds.y1,
                x2: bounds.x2,
                y2: bounds.y2,
                style: {
                    stroke: this.getStroke(),
                    "stroke-width": this.getStrokeWidth(), 
                    fill: this.getFill()
                },
                "marker-end": (arrows === "end" || arrows === "both") ? "url(#arrow-start)" : null,
                "marker-start": (arrows === "start" || arrows === "both") ? "url(#arrow-end)" : null,
                onpointerdown: event => itemMap.mouseDownInItem(this, event) 
            })
        } else if (type === "polylines") {
            const segments = this.getExtraData() || [[]]
            return m("g", {
                transform: "translate(" + bounds.x1 + "," + bounds.y1 + ")",
                key: this.uuid,
                onpointerdown: event => itemMap.mouseDownInItem(this, event)
            }, drawPolylines(segments, {
                stroke: this.getStroke(),
                "stroke-width": this.getStrokeWidth(), 
                fill: this.getFill()
            }))
        } else if (type === "text") {
            return m("text", {
                key: this.uuid,
                x: bounds.x1,
                // TODO: Fix the baseline
                y: bounds.y1,
                // Set a minimum size for the rectangle for now
                width: Math.max(10, bounds.x2 - bounds.x1),
                height: Math.max(10, bounds.y2 - bounds.y1),
                style: "user-select: none",
                // "inline-size": "250px",
                onpointerdown: event => itemMap.mouseDownInItem(this, event) 
            },
            splitText(this.getText(), bounds)
            )
        } else {
            return m("text", {
                key: this.uuid,
                x: bounds.x1,
                // TODO: Fix the baseline
                y: bounds.y2,
            },
            "Unsupported type: " + type
            )
        }
    }
}

class Sketch extends ObjectInTriplestore {
    constructor(uuid) {
        super(t, uuid, "sketch")
    }

    getItems() {
        return this.getFieldSet("items", uuid => new Item(uuid))
    }

    addItem(item) {
        this.insertIntoFieldSet("items", item.uuid)
    }

    deleteItem(item) {
        this.removeFromFieldSet("items", item.uuid)
    }

    getExtent() {
        let extent = this.getField("extent", "json", {})
        if (!extent.width || !extent.height) {
            extent = { width: 600, height: 200 }
        }
        return extent
    }

    setExtent(extent) {
        this.setField("extent", "json", extent)
    }

    setWidth(width) {
        const extent = this.getExtent()
        extent.width = parseInt(width)
        this.setExtent(extent)
    }

    setHeight(height) {
        const extent = this.getExtent()
        extent.height = parseInt(height)
        this.setExtent(extent)
    }
}

function addRectangle(bounds) {
    // MAYBE p.newTransaction("sketcher/addRectangle")
    const item = new Item()
    item.setType("rectangle")
    item.setBounds(bounds)
    sketch.addItem(item)
    // MAYBE p.sendCurrentTransaction()
    return item
}

function addCircle(bounds) {
    // MAYBE p.newTransaction("sketcher/addCircle")
    const item = new Item()
    item.setType("circle")
    item.setBounds(bounds)
    sketch.addItem(item)
    // MAYBE p.sendCurrentTransaction()
    return item
}

function addLine(bounds) {
    bounds.x2 += 5
    bounds.y2 += 5
    // MAYBE p.newTransaction("sketcher/addLine")
    const item = new Item()
    item.setType("line")
    item.setBounds(bounds)
    item.setStrokeWidth("5")
    sketch.addItem(item)
    // MAYBE p.sendCurrentTransaction()
    return item
}

function addFreehandScribble() {
    const scribble = itemMap.toggleFreehandScribble()
    if (scribble && scribble.bounds) {
        // MAYBE p.newTransaction("sketcher/addPolylines")
        const item = new Item()
        item.setType("polylines")
        item.setStrokeWidth("3")
        item.setStroke("#000000")
        item.setFill("none")
        item.setBounds(scribble.bounds)
        item.setExtraData(scribble.scribbleSegments)
        sketch.addItem(item)
        // MAYBE p.sendCurrentTransaction()
    }
}

function addText(bounds) {
    const text = prompt("Text to add?")
    drawMode = "pointer"
    if (!text) return
    // MAYBE p.newTransaction("sketcher/addText")
    const item = new Item()
    item.setType("text")
    item.setBounds(bounds)
    item.setText(text)
    sketch.addItem(item)
    // MAYBE p.sendCurrentTransaction()
    return item
}

function exportSketchText() {
    function textForItem(item) {
        if (item.getType() === "text") return JSON.stringify(item.getBounds()) + "\n" + item.getText()
        return JSON.stringify({
            type: item.getType(),
            bounds: item.getBounds(),
            layer: item.getLayer(),
            text: item.getText(),
            stroke: item.getStroke(),
            strokeWidth: item.getStrokeWidth(),
            fill: item.getFill(),
            arrows: item.getArrows(),
            extraData: item.getExtraData()
        }, null, 4)
    }

    // const svgSketch = document.getElementsByClassName("sketch")[0]
    // console.log("svgSketch", svgSketch)
    const items = sketch.getItems().reverse()
    const texts = items.map(item => "==== " + item.uuid + " ====\n" + textForItem(item))
    console.log("texts", texts.join("\n\n"))
    alert("Exported text to console")
}

// From: https://stackoverflow.com/questions/31593297/using-execcommand-javascript-to-copy-hidden-text-to-clipboard#
function setClipboard(value) {
    var tempInput = document.createElement("input")
    tempInput.style = "position: absolute; left: -1000px; top: -1000px"
    tempInput.value = value
    document.body.appendChild(tempInput)
    tempInput.select()
    document.execCommand("copy")
    document.body.removeChild(tempInput)
}

function copySVG() {
    const selectedItems = itemMap.getSelectedItems()
    if (selectedItems.length === 0) return alert("nothing selected")
    const boundsForSelected = itemMap.calculateBoundsForItems(selectedItems)
    const deltaForExport = { x: -boundsForSelected.x1, y: -boundsForSelected.y1 }
    const itemContent = itemMap.drawItems(selectedItems, deltaForExport)
    const temporaryNode = document.createElement("svg")
    temporaryNode.setAttribute("width", Math.ceil(boundsForSelected.x2 - boundsForSelected.x1))
    temporaryNode.setAttribute("height", Math.ceil(boundsForSelected.y2 - boundsForSelected.y1))
    m.render(temporaryNode, itemContent)
    const svgAsText = temporaryNode.outerHTML
    // console.log(svgAsText)
    setClipboard(svgAsText)
}

function displaySelectedItemProperties() {
    // TODO: Add support for changing all selections at once
    const selectedItems = itemMap.getSelectedItems()
    const item = selectedItems.length ? selectedItems[selectedItems.length - 1] : null
    if (!item) return m("div.mt2.relative", [
        itemMap.getIsScribbling() ? m("span.absolute.pl2" + selectedClass(true), "Scribbling...") : [],
        m("span.tr.w5.dib", "Sketch width"), m("input.ml1", { value: sketch.getExtent().width, onchange: (event) => sketch.setWidth(event.target.value) }),
        m("br"),
        m("span.tr.w5.dib", "Sketch height"), m("input.ml1", { value: sketch.getExtent().height, onchange: (event) => sketch.setHeight(event.target.value) }),
        m("br"),
        m("span.tr.w5.dib", "Sketch viewport height"), m("input.ml1", { value: sketchViewportHeight, onchange: (event) => sketchViewportHeight = event.target.value }),
    ])
    const type = item.getType()
    if (type === "text") return m("div.mt2", [
        m("span.tr.w5.dib", "Layer"), m("input.ml1", { value: item.getLayer(), onchange: (event) => item.setLayer("" + Math.parseInt(event.target.value)) }),
        m("br"),
        "Text:",
        m("br"),
        m("textarea", { rows: 5, cols: 60,  value: item.getText(), onchange: (event) => item.setText(event.target.value) })
    ])
    const arrows = item.getArrows()
    return m("div.mt2", [
        // m("span.tr.w5.dib", type),
        // m("br"),
        m("span.tr.w5.dib", "Layer"), m("input.ml1", { value: item.getLayer(), onchange: (event) => item.setLayer("" + Math.parseInt(event.target.value)) }),
        m("br"),
        m("span.tr.w5.dib", "Fill"), m("input.ml1", { value: item.getFill(), onchange: (event) => item.setFill(event.target.value) }),
        m("br"),
        m("span.tr.w5.dib", "Stroke"), m("input.ml1", { value: item.getStroke(), onchange: (event) => item.setStroke(event.target.value) }),
        m("br"),
        m("span.tr.w5.dib", "Stroke width"), m("input.ml1", { value: item.getStrokeWidth(), onchange: (event) => item.setStrokeWidth(event.target.value) }),
        (type === "line") ? [
            m("br"),
            m("span.tr.w5.dib", "Arrows"), m("select.ml1", { value: arrows, onchange: (event) => item.setArrows(event.target.value) }, [
                m("option", {value: "none", selected: arrows === "none" }, "none"),
                m("option", {value: "start", selected: arrows === "start" }, "start"),
                m("option", {value: "end", selected: arrows === "end" }, "end"),
                m("option", {value: "both", selected: arrows === "both" }, "both"),
            ]),
        ] : []
    ])
}

let drawMode = "pointer" // pointer, rectangle, circle, text, line, freehand

function setDrawMode(mode) {
    // close scribble if scribbling
    if (itemMap.getIsScribbling() && mode !== "scribble") {
        addFreehandScribble()
    }

    if (mode === "scribble") {
        // scribble handled specially as can have multiple segments with mouse up and down
        itemMap.setItemCreationCallback(null)
        itemMap.setItemCompletionCallback(null)
        addFreehandScribble()
        if (!itemMap.getIsScribbling()) mode = "pointer"
    } else {
        const itemCreationCallback = {
            pointer: null,
            rectangle: addRectangle,
            circle: addCircle,
            text: addText,
            line: addLine
        }[mode]

        itemMap.setItemCreationCallback(itemCreationCallback)

        itemMap.setItemCompletionCallback((itemCreationCallback && itemCreationCallback !== addText)
            ? () => drawMode = "pointer" 
            : null
        )
    }

    drawMode = mode
}

function selectedClass(isSelected) {
    return isSelected ? ".bg-light-blue" : ""
}

function displayActions() {
    return m("div.mt1.mb1", [
        m("button" + selectedClass(drawMode === "pointer"), { onclick: () => setDrawMode("pointer") }, "Pointer"),
        m("button.ml1" + selectedClass(drawMode === "rectangle"), { onclick: () => setDrawMode("rectangle") }, "Rectangle"),
        m("button.ml1" + selectedClass(drawMode === "circle"), { onclick: () => setDrawMode("circle") }, "Circle"),
        m("button.ml1" + selectedClass(drawMode === "text"), { onclick: () => setDrawMode("text")}, "Text"),
        m("button.ml1" + selectedClass(drawMode === "line"), { onclick: () => setDrawMode("line") }, "Line"),
        m("button.ml1.w4" + selectedClass(itemMap.getIsScribbling()), 
            { onclick: () => setDrawMode("scribble") }, 
            itemMap.getIsScribbling() ? "<Finish>": "Freehand"
        ),
        m("button.ml3", { onclick: raiseItem }, "Raise"),
        m("button.ml1", { onclick: lowerItem }, "Lower"),
        m("button.ml3", { onclick: deleteItem }, "Delete"),
        m("button.ml3", { onclick: exportSketchText }, "Export Text"),
        m("button.ml3", { onclick: copySVG, title: "Copy selected SVG into clipboard"}, "Copy SVG"),
    ])
}

function displaySketch() {
    const extent = sketch.getExtent()
    return m("div",
        displayActions(),
        m("div",
            {
                style: {
                    "max-height": sketchViewportHeight + "px",
                    "max-width": "100%",
                    border: "2px solid #000",
                    overflow: "scroll",
                }
            },
            itemMap.viewItemMap(sketch.getItems(), extent)
        ),
        displaySelectedItemProperties()
    )
}

function promptToCreateSketch() {
    const uuid = prompt("Start a sketch with this UUID?", UUID.forType("sketch"))
    if (!uuid) return
    sketch = new Sketch(uuid)
    itemMap.initDragInformation()
    t.addTriple({a: "sketcher:root", b: "currentSketch", c: uuid})
}

const SketchViewer = {
    view: function() {
        return m(".main.ma1", [
            Toast.viewToast(),
            t.getLoadingState().isFileLoaded
                ? getCurrentSketchUUID()
                    ? displaySketch()
                    : m("button.ma3", {onclick: promptToCreateSketch}, "No sketch here yet. Click to start a sketch.")
                : "Loading... "
        ])
    }
}

async function startup() {
    const filePathFromParams = decodeURI(window.location.pathname)
    t.setFileName(filePathFromParams)
    await t.loadFileContents()
    let currentSketch = getCurrentSketchUUID()
    if (currentSketch) {
        sketch = new Sketch(currentSketch)
        itemMap.initDragInformation()
    }
}

m.mount(document.body, SketchViewer)

startup()
