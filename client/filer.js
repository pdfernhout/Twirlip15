/* global m */
import "./vendor/mithril.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""

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
        errorMessage = "API request failed: " + response.status
    }
    m.redraw()
}

function fileEntryView(fileInfo) {
    return fileInfo.isDirectory
        ? m("div", m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/")}, fileInfo.name + " 📂"))
        : m("div", fileInfo.name)
}


const Filer = {
    view: () => {
        return m("div", 
            m("div", "Files in: ", directoryPath),
            directoryFiles
                ? m("div", directoryFiles.map(fileInfo => fileEntryView(fileInfo)))
                : "Loading file data...",
            errorMessage && m("div.red", errorMessage) 
        )
    }
}

m.mount(document.body, Filer)

loadDirectory("/")
