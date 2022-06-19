// Simple spreadsheet
// Ideas from: https://lhorie.github.io/mithril-blog/a-spreadsheet-in-60-lines-of-javascript.html

"use strict"
/* eslint-disable no-console */

/* global m */

// defines m
import "../../vendor/mithril.js"
import { Toast } from "../../common/Toast.js"
import { UUID } from "../../common/UUID.js"
import { Triplestore } from "../../common/Triplestore.js"

function showError(error) {
    console.log("error", error)
    const errorMessage = error.message
        ? error.message
        : error
    Toast.toast(errorMessage)
}

const t = Triplestore(showError)

const showFormulasForTable = {}

function convertNumber(numberString) {
    const prefix = "number:"
    if (!numberString.startsWith(prefix)) return NaN
    return parseFloat(numberString.substring(prefix.length))
}

function convertText(textString) {
    const prefix = "text:"
    if (!textString.startsWith(prefix)) return ""
    return textString.substring(prefix.length)
}

class Table {
    constructor(uuid) {
        this.uuid = uuid || ("table:" + UUID.uuidv4())
    }

    getName() {
        return convertText(t.findLast(this.uuid, "name") || "text:Unnamed")
    }

    setName(name) {
        t.addTriple({a: this.uuid, b: "name", c: "text:" + name})
    }

    getWidth() {
        return convertNumber(t.findLast(this.uuid, "width") || "number:5")
    }

    setWidth(width) {
        width = parseInt(width)
        if (!width) return
        width = Math.max(1, width)
        width = Math.min(26, width)
        t.addTriple({a: this.uuid, b: "width", c: "number:" + width})
    }

    getHeight() {
        return convertNumber(t.findLast(this.uuid, "height") || "number:10")
    }

    setHeight(height) {
        t.addTriple({a: this.uuid, b: "height", c: "number:" + height})
    }

    getShowFormulas() {
        // return t.findLast(this.uuid, "showFormulas") || false
        return showFormulasForTable[this.uuid]
    }

    setShowFormulas(showFormulas) {
        // t.addTriple({a: this.uuid, b: "showFormulas", c: "boolean" + showFormulas})
        showFormulasForTable[this.uuid] = showFormulas
    }

    getCell(x, y) {
        return convertText(t.findLast(this.uuid, JSON.stringify({x: x, y: y})) || "text:")
    }

    setCell(x, y, contents) {
        if (this.getCell(x, y) !== contents) {
            t.addTriple({a: this.uuid, b: JSON.stringify({x: x, y: y}), c: "text:" + contents})
        }
    } 
    
    getColumnWidth(x) {
        return convertNumber(t.findLast(this.uuid, JSON.stringify({columnWidth: x})) || "number:8")
    }

    setColumnWidth(x, value) {
        value = Math.max(2, value)
        t.addTriple({a: this.uuid, b: JSON.stringify({columnWidth: x}), c: "number:" + value})
    } 
}   

const tablesRoot = "tables:root"

class TablesApplication {

    getTables() {
        return t.find(tablesRoot, "hasTable").map(uuid => new Table(uuid))
    }

    addTable(table) {
        t.addTriple({a: tablesRoot, b: "hasTable", c: table.uuid, o: "insert"})
    }

    deleteItem(table) {
        t.addTriple({a: tablesRoot, b: "hasTable", c: table.uuid, o: "remove"})
    }

    getTableForName(name) {
        const tables = this.getTables()
        for (let table of tables) {
            if (table.getName() === name) return table
        }
        return null
    }
}

let tablesApplication = new TablesApplication()

function makeNewTable() {
    const name = prompt("New table name? e.g. electric")
    if (!name) return
    const table = new Table()
    table.setName(name)
    tablesApplication.addTable(table)
}

let focusedCell = {tableName: "", row: 0, column: 0}

let lastCellCopiedFrom = null
let lastTextCopied = ""

// TODO: This could mess up strings with cell refs in them
// This is limited to basic math for non-space separated cell refs.
// Other cell refs need to be separated from operators by spaces.
const cellRefRegex = /(^| |=|\+|-|\*|\/|\(|\))(\$?)([a-z]+)(\$?)([0-9]+)/g

function nextCharacter(c) {
    return String.fromCharCode(c.charCodeAt(0) + 1)
}

function displayTable(table) {
    const width = table.getWidth()
    const height =  table.getHeight()

    // To prevent and report circular references
    let cellsRequired = {}
    let cellsResult = {}
    let cellHasError = false
    let currentTable = table

    function evalFormula(textToEval) {
        // Replace cell ref strings with function calls
        textToEval = textToEval.replace(cellRefRegex, "$1cell(\"$3$5\")")
        return eval(textToEval)
    }

    // cell can be used within spreadsheet
    // Recursive via eval
    function cell(cellName, tableName) {
        const t = tableName ? tablesApplication.getTableForName(tableName) : currentTable
        currentTable = t
        if (!t) throw new Error("No table named: " + tableName)

        // eslint-disable-next-line no-unused-vars
        const [discard0, discard1, discard2, letter, discard3, number] = new RegExp(cellRefRegex).exec(cellName)
        const c = letter.charCodeAt(0) - "a".charCodeAt(0)
        const r = parseInt(number) - 1

        return cell_(t, c, r)
    }

    function cell_(t, c, r) {
        currentTable = t

        const cellRefJSON = JSON.stringify({tableName: t.getName(), c, r})
        if (cellsResult[cellRefJSON] !== undefined) {
            return cellsResult[cellRefJSON]
        }
        if (cellsRequired[cellRefJSON]) throw new Error("Circular reference: " + cellRefJSON)
        cellsRequired[cellRefJSON] = true
        
        let contents = t.getCell(c, r)
        let result
        if (contents.startsWith("=")) {
            let textToEval = contents.substring(1)
            try {
                result = evalFormula(textToEval)
            } catch (e) {
                console.log("Error in cell", e)
                result = "#REF!"
                cellHasError = true
            }
        } else {
            if (!isNaN(contents)) {
                result = parseFloat(contents)
            } else {
                result = contents
            }
        }
        cellsResult[cellRefJSON] = result
        return result
    }

    // eslint-disable-next-line no-unused-vars
    function _(cellName, tableName) {
        return cell(cellName, tableName)
    }

    // eslint-disable-next-line no-unused-vars
    function sum(range) {
        console.log("sum", range)
        const [start, end] = range.split(":")
        let total = 0
        let cellName = start
        while (cellName <= end) {
            const callValue = cell(cellName)
            if (!isNaN(callValue)) total += cell(cellName)
            if (start[1] !== end[1]) {
                cellName = cellName[0] + nextCharacter(cellName[1]) 
            } else if (start[0] !== end[0]) {
                cellName = nextCharacter(cellName[0]) + cellName[1]
            } else {
                break
            }
        }
        return total
    }

    function setWidth(column) {
        let newWidth = prompt("New column width (2-80)", table.getColumnWidth(column))
        if (!newWidth) return
        newWidth = parseInt(newWidth)
        if (newWidth < 2) newWidth = 2
        if (newWidth > 80) newWidth = 80
        table.setColumnWidth(column, newWidth)
    }

    function getSelection(element) {
        return element.value.slice(element.selectionStart, element.selectionEnd)
    }

    function updateTextForPasteInNewLocation(text, from, to) {
        const dx = to.column - from.column
        const dy = to.row - from.row
        
        return text.replace(cellRefRegex, (match, leader, absoluteLetter, letter, absoluteNumber, number) => {
            if (!absoluteLetter) {
                if (letter.length > 1) {
                    console.log("only one character cell references supported yet")
                    letter = "#REF!"
                } else {
                    const newLetterIndex = letter.charCodeAt(0) + dx
                    if (newLetterIndex >= "a".charCodeAt(0) && newLetterIndex <= "z".charCodeAt(0)) {
                        letter = String.fromCharCode(newLetterIndex)
                    } else {
                        letter = "#REF!"
                    }
                }
            }
            if (!absoluteNumber) {
                number = parseInt(number) + dy
                if (number < 1) {
                    number = "#REF!"
                }
            }
            return leader + absoluteLetter + letter + absoluteNumber + number
        })
    }

    function cells() {
        const rows = []

        let headers = []
        headers.push(m("th.bg-moon-gray.bb.w2"))
        for (let column = 0; column < width; column++) {
            const theColumn = column
            const letter = String.fromCharCode("a".charCodeAt(0) + column)
            headers.push(m("th.bg-moon-gray.pa1.bl.bb.br", {
                onclick: () => setWidth(theColumn),
            }, letter))
        }
        rows.push(m("tr", headers))

        for (let row = 0; row < height; row++) {
            const columns = []
            columns.push(m("th.bg-moon-gray.bb.br", "" + (row + 1)))
            for (let column = 0; column < width; column++) {
                const enteredText = table.getCell(column, row)
                let displayText = enteredText
                cellHasError = false
                if (!table.getShowFormulas() && enteredText.startsWith("=") && (focusedCell.tableName !== table.getName() || focusedCell.column !== column || focusedCell.row !== row)) {
                    try {
                        cellsRequired = {}
                        displayText = cell_(table, column, row)
                    } catch (e) {
                        displayText = enteredText
                        cellHasError = true
                        console.log("Error", e)
                    }
                }
                columns.push(m("td.pa1.br.bb", m("input.bw0" + (cellHasError ? ".orange" : ""), {
                    style: {
                        textAlign: isNaN(displayText) || displayText === "" ? "left" : "right",
                        width: table.getColumnWidth(column) + "rem"
                    },
                    onkeydown: (event) => {
                        if (event.keyCode === 13) {
                            table.setCell(column, row, event.target.value)
                            return
                        }
                        event.redraw = false
                    },
                    onfocus: () => focusedCell = {tableName: table.getName(), column: column, row: row },
                    value: displayText, 
                    onchange: event => table.setCell(column, row, event.target.value),
                    oncopy: (event) => {
                        event.redraw = false
                        lastCellCopiedFrom = {row, column}
                        lastTextCopied = getSelection(event.target)
                    },
                    oncut: (event) => {
                        event.redraw = false
                        lastCellCopiedFrom = {row, column}
                        lastTextCopied = getSelection(event.target)
                    },
                    onpaste: (event) => {
                        event.redraw = false

                        // Get pasted data via clipboard API
                        const clipboardData = e.clipboardData || window.clipboardData
                        const pastedData = clipboardData.getData("Text")

                        if (pastedData === lastTextCopied) {
                            const updatedText = updateTextForPasteInNewLocation(pastedData, lastCellCopiedFrom, {row, column})
                            document.execCommand("insertText", false, updatedText)
                            // Stop data from being pasted into div by event by returning false
                            return false
                        }
                    }
                })))
            }
            rows.push(m("tr", columns))
        }

        return m("table.collapse", m("tbody", rows))
    }

    return m("div.mt3.mb3", {key: table.uuid}, [
        m("div", 
            m("span.b.f2", table.getName()),
            m("label.ml2", "columns:",
                m("input.ml1.w2", {value: width, onchange: (event) => table.setWidth(event.target.value)}),
            ),
            m("label.ml2", "rows:",
                m("input.ml1.w2", {value:height, onchange: (event) => table.setHeight(event.target.value)}),
            ),
            m("input[type=checkbox].ml3.mr1", {checked: table.getShowFormulas(), onchange: () => table.setShowFormulas(!table.getShowFormulas())}),
            "show formulas"
        ),
        cells()
    ])
}

function displayTables() {
    const tables = tablesApplication.getTables()
    tables.sort((a, b) => ("" + a.getName() + " |" + a.uuid).localeCompare(b.getName() + " |" + b.uuid))
    return m("div.ma1", [
        tables.map((table) => {
            return displayTable(table)
        }),
        m("div.mt1", [
            m("button", { onclick: () => makeNewTable() }, "New Table"),
        ])
    ])
}

const TablesViewer = {
    view: function() {
        const result = m(".main.ma1", [
            Toast.viewToast(),
            t.getLoadingState().isFileLoaded ? 
                displayTables() :
                "Loading... " 
        ])
        return result
    }
}

async function startup() {
    const filePathFromParams = decodeURI(window.location.pathname)
    t.setFileName(filePathFromParams)
    await t.loadFileContents()
}

m.mount(document.body, TablesViewer)

startup()
