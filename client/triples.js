/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

let errorMessage = ""
let chosenFileName = ""
let fileSaveInProgress = false
let chosenFileLoaded = false

let triples = []

function showError(error) {
    errorMessage = error
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileLoaded = false
    const apiResult = await twirlip15ApiCall({request: "file-contents", fileName: chosenFileName}, showError)
    if (apiResult) {
        const chosenFileContents = apiResult.contents
        const lines = chosenFileContents.split("\n")
        const newTriples = []
        for (const line of lines) {
            if (line.trim()) {
                let triple
                try {
                    triple = JSON.parse(line)
                } catch (error) {
                    console.log("problem parsing line in file", error, line)
                    continue
                }
                newTriples.push(triple)
            }
        }
        triples = newTriples
        chosenFileLoaded = true
    }
}

async function appendFile(fileName, stringToAppend, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await twirlip15ApiCall({request: "file-append", fileName, stringToAppend}, showError)
    fileSaveInProgress = false
    if (apiResult && successCallback) {
        successCallback()
    }
}

function addTriple(triple) {
    triples.push(triple)
    appendFile(chosenFileName, JSON.stringify(triple) + "\n")
}

function viewTriple(triple) {
    return m("tr", 
        m("td", triple.a),
        m("td", triple.b),
        m("td", triple.c),
    )
}

function viewTriples() {
    return m("table",
        m("thead", 
            m("tr",
                m("th", "A"),
                m("th", "B"),
                m("th", "C"),
            )
        ),
        m("tbody", triples.map(triple => viewTriple(triple)))
    )
}

let editedTriple = {a: "", b: "", c: ""}

function viewTripleEditorField(fieldName) {
    return m("div.ml2",
        m("span", fieldName.toUpperCase() + ":"),
        m("input", {
            value: editedTriple[fieldName], 
            oninput: event => editedTriple[fieldName] = event.target.value
        })
    )
}

function viewTripleEditor() {
    return m("div.mt2", 
        m("div", "New Triple"),
        viewTripleEditorField("a"),
        viewTripleEditorField("b"),
        viewTripleEditorField("c"),
        m("button", {
            onclick: () => {
                addTriple(editedTriple)
                editedTriple = {a: "", b: "", c: ""}
            }
        }, "Add triple")
    )
}

const IBIS = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileLoaded && m("div",
                "Loading..."
            ),
            chosenFileLoaded && m("div",
                viewTriples(),
                viewTripleEditor()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)
loadFileContents(filePathFromParams)

m.mount(document.body, IBIS)
