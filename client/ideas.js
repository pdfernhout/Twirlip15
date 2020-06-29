/* global m, showdown */
import "./vendor/mithril.js"
import "./vendor/showdown.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""

async function apiCall(request) {
    let result = null
    errorMessage = ""
    const response = await fetch("/twirlip15-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify(request)
    })
    if (response.ok) {
        const json = await response.json()
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

async function loadDirectory(newPath) {
    if (newPath.endsWith("/../")) {
        const newPathParts = newPath.split("/")
        newPathParts.pop()
        newPathParts.pop()
        newPathParts.pop()
        newPath = newPathParts.join("/") + "/"
    }
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    const apiResult = await apiCall({request: "file-directory", directoryPath: directoryPath, includeStats: true})
    if (apiResult) {
        directoryFiles = apiResult.files.filter(
            fileInfo => !fileInfo.isDirectory 
            && !fileInfo.name.startsWith(".")
            && fileInfo.name.endsWith(".md")
        )
    }
    directoryFiles.forEach(fileInfo => loadFileContents(fileInfo))
}

async function loadFileContents(fileInfo) {
    const apiResult = await apiCall({request: "file-contents", fileName: directoryPath + fileInfo.name})
    if (apiResult) {
        fileInfo.contents = apiResult.contents
    }
}

function convertMarkdown(text) {
    const converter = new showdown.Converter({simplifiedAutoLink: true})
    const html = converter.makeHtml(text)
    // Add ?twirlip=view-md as needed
    const re = /(<a href="[^?>]*)(">)/g
    const html2 = html.replace(re, "$1?twirlip=view-md$2")
    return html2
}

function viewFileEntry(fileInfo) {
    return m("div.ba.ma2", m("a", {href: fileInfo.name + "?twirlip=view-md"}, fileInfo.name),
        fileInfo.contents && m("div.ml2", m.trust(convertMarkdown(fileInfo.contents)))
    )
}

function viewDirectoryFiles() {
    return directoryFiles
        ? m("div", 
            directoryFiles.length === 0
                ? "No *.md files in directory"
                : directoryFiles.map(fileInfo => viewFileEntry(fileInfo))
        )
        : m("div", "Loading file data...")
}

const Ideas = {
    view: () => {
        return m("div.ma2.mw-37rem",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            viewDirectoryFiles()
        )
    }
}

const startDirectory =  window.location.pathname
loadDirectory(startDirectory, "replace")

m.mount(document.body, Ideas)
