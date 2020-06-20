/* global m */
import "./vendor/mithril.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = ""
let editing = false
let editedContents = ""
let fileSaveInProgress = false

window.onpopstate = function(event) {
    if (event.state) {
        loadDirectory(event.state.directoryPath, false)
    } else {
        loadDirectory("/", false)
    }
}

async function loadDirectory(newPath, saveState) {
    if (newPath.endsWith("/../")) {
        const newPathParts = newPath.split("/")
        newPathParts.pop()
        newPathParts.pop()
        newPathParts.pop()
        newPath = newPathParts.join("/") + "/"
        history.back()
        return
    }
    if (saveState) {
        history.pushState({directoryPath: newPath}, newPath)
    }
    console.log("loadDirectory", newPath)
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    chosenFileName = ""
    chosenFileContents = null
    editing = false
    const response = await fetch("/twirlip15-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify({request: "file-directory", directoryPath: directoryPath})
    })
    if (response.ok) {
        const json = await response.json()
        console.log("response", response)
        if (json.ok) {
            directoryFiles = json.files
            if (directoryPath !== "/") directoryFiles.unshift({name: "..", isDirectory: true})
        } else {
            errorMessage = json.errorMessage
        }   
    } else {
        console.log("HTTP-Error: " + response.status, response)
        errorMessage = "API request failed for file-directory: " + response.status
    }
    m.redraw()
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    editing = false
    const response = await fetch("/twirlip15-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify({request: "file-contents", fileName: chosenFileName})
    })
    if (response.ok) {
        const json = await response.json()
        console.log("response", response)
        if (json.ok) {
            chosenFileContents = json.contents
        } else {
            errorMessage = json.errorMessage
        }   
    } else {
        console.log("HTTP-Error: " + response.status, response)
        errorMessage = "API request failed for file contents: " + response.status
    }
    m.redraw()
}

async function saveFile(fileName, contents, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const response = await fetch("/twirlip15-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify({request: "file-save", fileName, contents})
    })
    if (response.ok) {
        const json = await response.json()
        console.log("response", response)
        if (json.ok) {
            successCallback()
        } else {
            errorMessage = json.errorMessage
        }   
    } else {
        console.log("HTTP-Error: " + response.status, response)
        errorMessage = "API request failed for file save: " + response.status
    }
    fileSaveInProgress = false
    m.redraw()
}

function viewDirectoryFiles() {
    return directoryFiles
        ? m("div", directoryFiles.map(fileInfo => viewFileEntry(fileInfo)))
        : m("div", "Loading file data...")
}

function viewFileEntry(fileInfo) {
    return fileInfo.isDirectory
        ? m("div", m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/", true)}, "📂 " + fileInfo.name))
        : m("div",
            m("a.link", {href: directoryPath + fileInfo.name}, "📄 "), 
            m("span", {onclick: () => loadFileContents(directoryPath + fileInfo.name)}, fileInfo.name)
        )
}

function viewFileContents() {
    return m("div",
        (chosenFileName && (chosenFileContents === null)) && m("div", "Loading file contents..."),
        (chosenFileContents !== null) && m("div",
            m("div",
                m("button", {onclick: () => editing = false, disabled: !editing}, "View"),
                m("button", {onclick: () => {
                    editing = true
                    editedContents = chosenFileContents
                }, disabled:  editing}, "Edit"),
                m("button", {onclick: () => { 
                    saveFile(chosenFileName, editedContents, () => chosenFileContents = editedContents)
                }, disabled: !editing || fileSaveInProgress}, "Save"),
                fileSaveInProgress && m("span.yellow", "Saving...")
            ),
            editing
                ? m("textarea.w-90", {style: {height: "400px"}, value: editedContents, onchange: event => editedContents = event.target.value})
                : m("pre.ml2", {style: "white-space: pre-wrap;"}, chosenFileContents)
        )
    )
}

const Filer = {
    view: () => {
        return m("div", 
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            m("div", "Files in: ", directoryPath),
            viewDirectoryFiles(),
            chosenFileName && m("div.ml2.mt2", "Chosen file: " , chosenFileName),
            viewFileContents()
        )
    }
}

m.mount(document.body, Filer)

loadDirectory("/", false)
