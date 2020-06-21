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
let showMenu = false
let selectedFiles = {}

window.onpopstate = function(event) {
    if (event.state) {
        loadDirectory(event.state.directoryPath, false)
    } else {
        loadDirectory("/", false)
    }
}

async function apiCall(request) {
    let result = null
    const response = await fetch("/twirlip15-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify(request)
    })
    if (response.ok) {
        const json = await response.json()
        console.log("response", response)
        if (json.ok) {
            result = json
        } else {
            errorMessage = json.errorMessage
        }   
    } else {
        console.log("HTTP-Error: " + response.status, response)
        errorMessage = "API request failed for file contents: " + response.status
    }
    setTimeout(() => m.redraw(), 0)
    return result
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
    const apiResult = await apiCall({request: "file-directory", directoryPath: directoryPath})
    if (apiResult) {
        directoryFiles = apiResult.files
        if (directoryPath !== "/") directoryFiles.unshift({name: "..", isDirectory: true})
    }
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    editing = false
    const apiResult = await apiCall({request: "file-contents", fileName: chosenFileName})
    if (apiResult) {
        chosenFileContents = apiResult.contents
    }
}

async function saveFile(fileName, contents, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await apiCall({request: "file-save", fileName, contents})
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
    }
}

async function addFile() {
    const newFileName = prompt("New file name?")
    if (newFileName) {
        const fileName = directoryPath + newFileName
        const apiResult = await apiCall({request: "file-save", fileName, contents: ""})
        if (apiResult) loadDirectory(directoryPath, false)
    }
}

async function addDirectory() {
    const newFileName = prompt("New directory name?")
    if (newFileName) {
        const fileName = directoryPath + newFileName
        const apiResult = await apiCall({request: "file-new-directory", directoryPath: fileName, contents: ""})
        if (apiResult) loadDirectory(directoryPath, false)
    }
}

function renameFile() {
    alert("Rename TODO")
}

function deleteFile() {
    alert("Delete TODO")
}

function moveFile() {
    alert("Move TODO")
}

function showSelectedFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    alert("Selected files:\n" + sortedSelections.join("\n"))
}

function selectAll() {
    directoryFiles.forEach(fileInfo => {
        if (fileInfo.name !== "..") selectedFiles[directoryPath + fileInfo.name] = true
    })
}

function viewMenu() {
    return showMenu && m("div.ml4.bg-light-green.w5",
        m("div", {onclick: () => addFile()}, "+📄 Add file"),
        m("div", {onclick: () => addDirectory()}, "+📂 Add directory"),
        m("div", {onclick: () => renameFile()}, "* Rename"),
        m("div", {onclick: () => moveFile()}, "* Move"),
        m("div", {onclick: () => deleteFile()}, "* Delete")
    )
}

function viewSelectedFiles() {
    const selectedFileCount = Object.keys(selectedFiles).length
    return showMenu && m("div.ml4",
        "Selected file count: ",
        selectedFileCount,
        m("button.ml2", {onclick: () => selectAll(), }, "Select All"),
        m("button.ml2", {onclick: () => selectedFiles = {}, disabled: !selectedFileCount}, "Clear"),
        m("button.ml2", {onclick: () => showSelectedFiles(), disabled: !selectedFileCount}, "Show")
    )
}

function viewDirectoryFiles() {
    return directoryFiles
        ? m("div", directoryFiles.map(fileInfo => viewFileEntry(fileInfo)))
        : m("div", "Loading file data...")
}

function viewCheckBox(fileName) {
    const hidden = fileName === ".."
    return showMenu && m("input[type=checkbox].mr1" + (hidden ? ".o-0" : ""), {
        checked: selectedFiles[directoryPath + fileName],
        disabled: hidden,
        onclick: () => selectedFiles[directoryPath + fileName] = !selectedFiles[directoryPath + fileName]
    })
}

function viewFileEntry(fileInfo) { // selectedFiles
    return fileInfo.isDirectory
        ? m("div",
            viewCheckBox(fileInfo.name),
            m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/", true)}, "📂 " + fileInfo.name)
        )
        : m("div",
            viewCheckBox(fileInfo.name),
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
        return m("div.ma2", 
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            m("div", m("span.mr2", {onclick: () => showMenu = !showMenu}, "☰"), "Files in: ", directoryPath),
            viewMenu(),
            viewSelectedFiles(),
            viewDirectoryFiles(),
            chosenFileName && m("div.ml2.mt2", "Chosen file: " , chosenFileName),
            viewFileContents()
        )
    }
}

m.mount(document.body, Filer)

loadDirectory("/", false)
