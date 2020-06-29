/* global m, showdown */
import "./vendor/mithril.js"
import "./vendor/showdown.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""

let triples = []

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
    triples = []
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
    for (let fileInfo of directoryFiles) {
        await loadFileContents(fileInfo)
    }
    console.log("triples", triples)
}

function parseTriples(text) {
    const lines = text.split("\n")
    for (let line of lines) {
        line = line.trim()
        if (line.startsWith("@ ")) {
            console.log("starts with @ ", line)
            const segments = line.split(" ")
            segments.shift()
            if (segments.length === 2) {
                segments.unshift("self")
                triples.push(segments)
            } else if (segments.length === 3) {
                triples.push(segments)
            } else {
                console.log("@ command has too few or too many sections (not 2 or 3)", line)
                return
            }
        }
    }
}

async function loadFileContents(fileInfo) {
    const apiResult = await apiCall({request: "file-contents", fileName: directoryPath + fileInfo.name})
    if (apiResult) {
        fileInfo.contents = apiResult.contents
        parseTriples(fileInfo.contents)
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
    return m("div.ba.ma2.pa2",
            m("a.link", {href: fileInfo.name + "?twirlip=view-edit"}, "📄 "),
            m("a", {href: fileInfo.name + "?twirlip=view-md"}, fileInfo.name),
            fileInfo.contents && m("div.ml2", m.trust(convertMarkdown(fileInfo.contents))
        )
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
