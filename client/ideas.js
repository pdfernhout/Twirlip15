/* global m, showdown, cytoscape */
import "./vendor/mithril.js"
import "./vendor/showdown.js"
import "./vendor/cytoscape.umd.js"

console.log("cytoscape", cytoscape)

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let filter = ""
let triples = []

let navigate = "graph" // table

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
        ).sort((a, b) => {
            if (a.name === b.name) return 0
            if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
            if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
            throw new Error("sort by fileName: unexpected sort case")
        })
    }
    for (let fileInfo of directoryFiles) {
        await loadFileContents(fileInfo)
    }
    console.log("triples", triples)
}

async function addFile() {
    let newFileName = prompt("New file name?")
    if (newFileName) {
        if (!newFileName.endsWith(".md")) {
            newFileName =  newFileName + ".md"
        }
        const fileName = directoryPath + newFileName
        const apiResult = await apiCall({request: "file-save", fileName, contents: ""})
        if (apiResult) {
            window.location.assign(fileName + "?twirlip=view-edit")
        }
    }
}

function removeExtension(fileName) {
    return fileName.split(".md")[0]
}

function parseTriples(fileInfo) {
    const fileName = removeExtension(fileInfo.name)
    const text = fileInfo.contents
    const lines = text.split("\n")
    for (const untrimmedLine of lines) {
        const line = untrimmedLine.trimEnd()
        if (line.startsWith("@ ")) {
            console.log("starts with @ ", line)
            const segments = line.split(/\s+/)
            segments.shift()
            if (segments.length === 2) {
                segments.unshift(fileName)
                triples.push(segments)
            } else if (segments.length === 3) {
                if (segments[0] == "self" || segments[0] == "this") {
                    segments[0] = fileName
                }
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
        parseTriples(fileInfo)
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

function allTags() {
    const result = []
    for (const triple of triples) {
        if ( triple[1] === "tag") result.push(triple[2])
    }
    return result
}

function hasTag(name, tag) {
    for (const triple of triples) {
        if (triple[0] === name && triple[1] === "tag" && triple[2] === tag) return true
    }
    return false
}

function satisfiesFilter(name) {
    const tags = filter.trim().split(/\s+/)
    for (let tag of tags) {
        if (!hasTag(name, tag)) return false
    }
    return true
}

function viewFileEntry(fileInfo) {
    if (filter.trim() && !satisfiesFilter(removeExtension(fileInfo.name))) {
        return []
    }
    return m("div.ba.ma2.pa2",
            m("div.mb1",
                m("a.link", {href: fileInfo.name + "?twirlip=view-edit"}, "📄 "),
                m("a", {href: fileInfo.name + "?twirlip=view-md"}, removeExtension(fileInfo.name))
            ),
            fileInfo.contents && m("div.ml2.overflow-auto.mh-15rem", m.trust(convertMarkdown(fileInfo.contents))
        )
    )
}

function viewDirectoryFiles() {
    return directoryFiles
        ? m("div", 
            directoryFiles.length === 0
                ? "No *.md files in directory"
                : m("div",
                    m("div",
                        m("span.mr1", "filter by tag:"),
                        m("input", {value: filter, onchange: event => filter = event.target.value}),
                        m("div.mt2", "Tags:", allTags().map(tag => m("span.ml1", tag)))
                    ),
                    directoryFiles.map(fileInfo => viewFileEntry(fileInfo))
                )
        )
        : m("div", "Loading file data...")
}

let lastSort = "a"

function sortTriples(field) {
    lastSort === field
        ? lastSort = field + "-reversed"
        : lastSort = field
    const index = {
        a: 0,
        b: 1,
        c: 2
    }[field]
    triples.sort((a, b) => {
        if (a[index] === b[index]) return 0
        if (a[index].toLowerCase() < b[index].toLowerCase()) return -1
        if (a[index].toLowerCase() > b[index].toLowerCase()) return 1
        throw new Error("sortByFileName: unexpected sort case")
    })
    if (lastSort === field + "-reversed") triples.reverse()
}

function sortArrow(field) {
    if (field === lastSort) return "↓"
    if (field + "-reversed" === lastSort) return "↑"
    return ""
}

function viewTriples() {
    return m("table",
        m("tr",
            m("th.bg-light-silver", {onclick: () => sortTriples("a")}, "A" + sortArrow("a")),
            m("th.bg-light-silver", {onclick: () => sortTriples("b")}, "B" + sortArrow("b")),
            m("th.bg-light-silver", {onclick: () => sortTriples("c")}, "C" + sortArrow("c")),
        ),
        triples.map(triple => 
            m("tr",
                m("td", triple[0]),
                m("td.pl2", triple[1]),
                m("td.pl2", triple[2])
            )
        )
    )
}

function viewGraph() {
    return m("div#cy", {
        oncreate: renderCytoscape, 
            style: {
            width: "300px",
            height: "300px",
            display: "block"
        }
    })
}

const Ideas = {
    view: () => {
        return m("div.flex",
            m("div.ma2.mw-37rem",
                errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
                viewDirectoryFiles(),
                m("div.mt2",
                    m("button", {onclick: () => addFile()}, "+ New File"),
                    m("button.ml2", {onclick: () => window.location.assign(directoryPath + "?twirlip=filer")}, "Open Filer")
                )
            ),
            m("div",
                m("div.ma1", 
                    m("button", {onclick: () => navigate = "graph"}, "Graph"),
                    m("button.ml2", {onclick: () => navigate = "table"}, "Table")
                ),
                navigate === "table" && viewTriples(),
                navigate === "graph" && viewGraph()
            )
        )
    }
}

const startDirectory =  window.location.pathname
loadDirectory(startDirectory, "replace")

m.mount(document.body, Ideas)

function renderCytoscape() {
    console.log("renderCytoscape", document.getElementById("cy"))
    const cy = cytoscape({

        container: document.getElementById("cy"), // container to render in
    
        elements: [ // list of graph elements to start with
        { // node a
            data: { id: "a" }
        },
        { // node b
            data: { id: "b" }
        },
        { // edge ab
            data: { id: "ab", source: "a", target: "b" }
        }
        ],
    
        style: [ // the stylesheet for the graph
        {
            selector: "node",
            style: {
            "background-color": "#666",
            "label": "data(id)"
            }
        },
    
        {
            selector: "edge",
            style: {
            "width": 3,
            "line-color": "#ccc",
            "target-arrow-color": "#ccc",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier"
            }
        }
        ],
    
        layout: {
        name: "grid",
        rows: 1
        }
    
    })
    return cy
}