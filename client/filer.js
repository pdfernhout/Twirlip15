/* global m */
import "./vendor/mithril.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = ""

async function loadDirectory(newPath) {
    if (newPath.endsWith("../")) {
        const newPathParts = newPath.split("/")
        newPathParts.pop()
        newPathParts.pop()
        newPathParts.pop()
        newPath = newPathParts.join("/") + "/"
    }
    console.log("loadDirectory", newPath)
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    chosenFileName = ""
    chosenFileContents = null
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

function fileEntryView(fileInfo) {
    return fileInfo.isDirectory
        ? m("div", m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/")}, fileInfo.name + " 📂"))
        : m("div", m("span", {onclick: () => loadFileContents(directoryPath + fileInfo.name)}, fileInfo.name))
}

const Filer = {
    view: () => {
        return m("div", 
            m("div", "Files in: ", directoryPath),
            directoryFiles
                ? m("div", directoryFiles.map(fileInfo => fileEntryView(fileInfo)))
                : "Loading file data...",
            chosenFileName && m("div.ml2.mt2", "Chosen file: " , chosenFileName),
            (chosenFileName && (chosenFileContents === null)) && m("div", "Loading file contents..."),
            (chosenFileContents !== null) && m("pre.ml2", {style: "white-space: pre-wrap;"}, chosenFileContents),
            errorMessage && m("div.red", errorMessage) 
        )
    }
}

m.mount(document.body, Filer)

loadDirectory("/")
