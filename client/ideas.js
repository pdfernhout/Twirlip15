/* global m, showdown, cytoscape */
import "./vendor/mithril.js"
import "./vendor/showdown.js"
import "./vendor/cytoscape.umd.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let filter = ""
let triples = []

let navigate = "graph" // table

let cy

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
    renderCytoscape()
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
    const result = {}
    for (const triple of triples) {
        if ( triple[1] === "tag") result[triple[2]] = true
    }
    return Object.keys(result).sort()
}

function hasTag(name, tag) {
    for (const triple of triples) {
        if (triple[0] === name && triple[1] === "tag" && triple[2] === tag) return true
    }
    if (name === tag) return true
    return false
}

function satisfiesFilter(name) {
    const tags = filter.trim().split(/\s+/)
    for (let tag of tags) {
        if (!hasTag(name, tag)) return false
    }
    return true
}

function updateFilter(newFilter) {
    filter = newFilter

    // a workaround where cytoscape can get confused for origin for clicking when its container gets moved
    setTimeout(() => cy.resize(), 50)
}

function viewFileEntry(fileInfo) {
    if (filter.trim() && !satisfiesFilter(removeExtension(fileInfo.name))) {
        return []
    }
    return m("div.ba.ma2.pa2.br3",
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
                        m("span.mr1", "filter by tag (or file name):"),
                        m("input", {
                            value: filter,
                            onchange: event => updateFilter(event.target.value)
                        }),
                        m("span.ml1.pointer", {onclick: () => updateFilter(""), disabled: !filter}, "X"),
                        m("div.mt2", "Tags:", allTags().map(tag => m("span.ml1.pointer", {
                            onclick: () => updateFilter((filter ? filter + " " : "") + tag)
                        }, tag)))
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
    const fileNames = makeDirectoryFileNameDict()

    function colorFiles(name) {
        if (fileNames[name]) return ".green"
        return ""
    }

    return m("table", {
            style: {
                display: navigate === "table" ? "block" : "none"
            }
        },
        m("tr",
            m("th.bg-light-silver", {onclick: () => sortTriples("a")}, "A" + sortArrow("a")),
            m("th.bg-light-silver", {onclick: () => sortTriples("b")}, "B" + sortArrow("b")),
            m("th.bg-light-silver", {onclick: () => sortTriples("c")}, "C" + sortArrow("c")),
        ),
        triples.map(triple => 
            m("tr",
                m("td.pointer" + colorFiles(triple[0]), { onclick: () => openOrFilter(triple[0]) }, triple[0]),
                m("td.pl2", triple[1]),
                m("td.pl2.pointer" + colorFiles(triple[2]), { onclick: () => openOrFilter(triple[2]) }, triple[2])
            )
        )
    )
}

function viewGraph() {
    return m("div.ba#cy", {
        style: {
            display: navigate === "graph" ? "block" : "none",
            width: "600px",
            height: "600px"
        },
        oncreate: renderCytoscape
    })
}

const Ideas = {
    view: () => {
        return m("div.flex.h-100.w-100",
            m("div.ma2.w-37rem.mw-37rem.overflow-y-auto",
                errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
                m("div.mt2.mb1",
                    m("button", {onclick: () => addFile()}, "+ New File"),
                    m("button.ml2", {onclick: () => window.location.assign(directoryPath + "?twirlip=filer")}, "Open Filer")
                ),
                viewDirectoryFiles()
            ),
            m("div.overflow-auto",
                m("div.ma1", 
                    m("button", {onclick: () => navigate = "graph"}, "Graph"),
                    m("button.ml2", {onclick: () => navigate = "table"}, "Table")
                ),
                viewTriples(),
                viewGraph()
            )
        )
    }
}

function makeDirectoryFileNameDict() {
    const result = {}
    if (directoryFiles) {
        for (const fileInfo of directoryFiles) {
            result[removeExtension(fileInfo.name)] = true
        }
    }
    return result
}

function openOrFilter(id) {
    if (id.startsWith("http:") || id.startsWith("https:")) {
        window.location.assign(id)
    } else {
        updateFilter(id)
    }
}

function renderCytoscape() {

    const container = document.getElementById("cy")
    if (!container) {
        console.log("no cytoscape container", container)
        return
    }

    const savedPositions = JSON.parse(localStorage.getItem("twirlip-ideas--nodes") || "{}")

    const elements = []

    const fileNames = makeDirectoryFileNameDict()

    let addedNode = false
    const nodes = {}

    function addNode(label, extraClass) {
        if (!nodes[label]) {
            nodes[label] = true
            const element = {
                data: { id: label }
            }
            if (extraClass) element.classes = [extraClass]
            const savedPosition = savedPositions[label]
            if (savedPosition) {
                element.position = savedPosition
            } else {
                addedNode = true
            }
            elements.push(element)
        }
    }

    for (const fileName of Object.keys(fileNames)) {
        addNode(fileName, "green")
    }

    for (const triple of triples) {
        for (let i = 0; i < 3; i++) {
            if (i === 1) continue
            addNode(triple[i])
        }
        elements.push({
            data: { id: JSON.stringify(triple), source: triple[0], target: triple[2] }
        })
    }

    cy = cytoscape({

        container,
    
        elements,
    
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
            },
            {
                selector: ".green",
                style: {
                    "background-color": "green",
                }
            },
        ],
    
        layout: {
            name: addedNode ? "cose" : "preset",
            animate: false,
            nodeDimensionsIncludeLabels: true
        }
    
    })

    cy.on("tap", "node", function (event) {
        const id = event.target.id()
        openOrFilter(id)
        m.redraw()
    })

    cy.on("tapend", function () {
        saveNodePositions()
    })

    return cy
}

function saveNodePositions() {
    const result = {}
    const nodes = cy.json().elements.nodes
    for (const node of nodes) {
        result[node.data.id] = {x: node.position.x, y: node.position.y}
    }
    console.log("saveNodePositions", result)
    localStorage.setItem("twirlip-ideas--nodes", JSON.stringify(result))
}

function startup() {
    const startDirectory =  window.location.pathname
    loadDirectory(startDirectory, "replace")
    m.mount(document.body, Ideas)
}

startup()
