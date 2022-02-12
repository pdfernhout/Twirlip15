/* global m, showdown, cytoscape */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import "../../vendor/showdown.js"
import "../../vendor/cytoscape.umd.js"

const baseStorageKeyForNodes = "twirlip15-ideas--nodes"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let filter = ""
let triples = []
let allLinks = []
let filterMode = "and"

let navigate = "links" // "graph" "triples"

let cy

let loadingAllFiles = true

function showError(error) {
    errorMessage = error
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

async function loadDirectory(newPath) {
    loadingAllFiles = true
    triples = []
    allLinks = []
    if (!newPath.endsWith("/")) {
        newPath = newPath + "/"
    }
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    const apiResult = await TwirlipServer.fileDirectory(directoryPath, true)
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
    loadingAllFiles = false
    sortLinks("url")
    renderCytoscape()
}

function addLeadingZeros(n) {
    if (n <= 9) {
      return "0" + n
    }
    return n
}

async function addFile() {
    const today = new Date()
    const suggestedFileName = today.getFullYear() + "-" + addLeadingZeros(today.getMonth() + 1) + "-" + addLeadingZeros(today.getDate()) + "-ideas"
    let newFileName = prompt("New file name?", suggestedFileName)
    if (newFileName) {
        if (!newFileName.endsWith(".md")) {
            newFileName =  newFileName + ".md"
        }
        const fileName = directoryPath + newFileName
        const apiStatsResult = await TwirlipServer.fileStats(fileName)
        if (apiStatsResult && apiStatsResult.ok) {
            showError("File exists: " + fileName)
            return
        }
        const initialContents = removeExtension(newFileName) + "\n\n"
        const apiResult = await TwirlipServer.fileSave(fileName, initialContents)
        if (apiResult) {
            window.location = fileName + "?twirlip=edit"
        }
    }
}

function removeExtension(fileName, extension=".md") {
    return fileName.split(extension)[0]
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
    const apiResult = await TwirlipServer.fileContents(directoryPath + fileInfo.name)
    if (apiResult) {
        fileInfo.contents = apiResult.contents
        parseTriples(fileInfo)
        convertMarkdown(fileInfo)
        for (let link of fileInfo.links) {
            allLinks.push({name: fileInfo.name, url: link})
        }
    }
}

function convertMarkdown(fileInfo) {
    if (fileInfo.markdown) return fileInfo.markdown
    const text = fileInfo.contents
    const converter = new showdown.Converter({simplifiedAutoLink: true})
    const convertedHTML = converter.makeHtml(text)
    const re1 = /<a href="([^?>]*)">/g
    fileInfo.links = Array.from(convertedHTML.matchAll(re1)).map(match => match[1])
    // Add ?twirlip=view-md as needed
    const re2 = /(<a href="[^?>]*)(">)/g
    const html2 = convertedHTML.replace(re2, "$1?twirlip=view-md$2")
    fileInfo.markdown = html2
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
    if (tags.length === 0) return false
    if (filterMode === "and") {
        for (let tag of tags) {
            if (!hasTag(name, tag)) return false
        }
        return true
    } else if (filterMode === "or") {
        for (let tag of tags) {
            if (hasTag(name, tag)) return true
        }
        return false
    } else {
        throw new Error("filter mode not expected: " + filterMode)
    }
}

function updateFilter(newFilter) {
    filter = newFilter
    const tagsWithoutDuplicates = []
    const tags = filter.trim().split(/\s+/)
    for (const tag of tags) {
        if (!tagsWithoutDuplicates.includes(tag)) {
            tagsWithoutDuplicates.push(tag)
        }
    }
    filter = tagsWithoutDuplicates.join(" ")

    // a workaround where cytoscape can get confused for origin for clicking when its container gets moved
    setTimeout(() => cy.resize(), 50)
}

function viewFileEntry(fileInfo) {
    if (!satisfiesFilter(removeExtension(fileInfo.name))) {
        return []
    }
    return m("div.ba.ma2.pa2.br3",
            m("div.mb1",
                m("a.link", {href: fileInfo.name + "?twirlip=edit"}, "✎"),
                m("a.link", {href: fileInfo.name + "?twirlip=edit&mode=view"}, "📄 "),
                m("a", {href: fileInfo.name + "?twirlip=view-md"}, removeExtension(fileInfo.name))
            ),
            fileInfo.contents && m("div.ml2.overflow-auto.mh-15rem", m.trust(convertMarkdown(fileInfo))
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
                        m("span.mr1", {
                            title: "filter by tag (or file name); click to change and/or mode",
                            onclick: () => filterMode = filterMode === "and" ? "or" : "and"
                        }, "show (" + filterMode + "):"),
                        m("input.w-24rem", {
                            value: filter,
                            onchange: event => updateFilter(event.target.value)
                        }),
                        m("span.ml1.pointer", {onclick: () => updateFilter(""), disabled: !filter}, "X"),
                        m("div.mt2", "Tags: |", allTags().map(tag => m("span.ml1.pointer.i", {
                            onclick: () => updateFilter((filter ? filter + " " : "") + tag)
                        }, tag + " | "))),
                        m("div.mt2", "Pages: |", directoryFiles.map(fileInfo => m("span.ml1.pointer", {
                            onclick: () => updateFilter((filter ? filter + " " : "") + removeExtension(fileInfo.name))
                        }, m("span.dib", removeExtension(fileInfo.name) + " | "))))
                    ),
                    directoryFiles.map(fileInfo => viewFileEntry(fileInfo))
                )
        )
        : m("div", "Loading file data...")
}

let lastSortTriples = "a"

function sortTriples(field) {
    lastSortTriples === field
        ? lastSortTriples = field + "-reversed"
        : lastSortTriples = field
    const index = {
        a: 0,
        b: 1,
        c: 2
    }[field]
    triples.sort((a, b) => {
        if (a[index].toLowerCase() === b[index].toLowerCase()) return 0
        if (a[index].toLowerCase() < b[index].toLowerCase()) return -1
        if (a[index].toLowerCase() > b[index].toLowerCase()) return 1
        throw new Error("sortTriples: unexpected sort case")
    })
    if (lastSortTriples === field + "-reversed") triples.reverse()
}

let lastSortLinks = "name"

function sortLinks(field) {
    lastSortLinks === field
        ? lastSortLinks = field + "-reversed"
        : lastSortLinks = field
    allLinks.sort((a, b) => {
        if (a[field].toLowerCase() === b[field].toLowerCase()) return 0
        if (a[field].toLowerCase() < b[field].toLowerCase()) return -1
        if (a[field].toLowerCase() > b[field].toLowerCase()) return 1
        throw new Error("sortLinks: unexpected sort case")
    })
    if (lastSortLinks === field + "-reversed") allLinks.reverse()
}

function sortArrowTriples(field) {
    if (field === lastSortTriples) return "↓"
    if (field + "-reversed" === lastSortTriples) return "↑"
    return ""
}

function sortArrowLinks(field) {
    if (field === lastSortLinks) return "↓"
    if (field + "-reversed" === lastSortLinks) return "↑"
    return ""
}

function viewLinks() {
    return m("table", {
            style: {
                display: navigate === "links" ? "block" : "none"
            }
        },
        m("tr",
            m("th.bg-light-silver", {onclick: () => sortLinks("name")}, "File" + sortArrowLinks("name")),
            m("th.bg-light-silver", {onclick: () => sortLinks("url")}, "URL" + sortArrowLinks("url")),
        ),
        allLinks.map(link => 
            m("tr", 
                m("td.pointer.w-10", { onclick: () => openOrFilter(removeExtension(link.name)) }, removeExtension(removeExtension(link.name), "-ideas")),
                m("td.pl2.w-90", m("a", {href: link.url, target: "_blank", rel: "noopener noreferrer"}, link.url)),
            )
        )
    )
}

function viewTriples() {
    const fileNames = makeDirectoryFileNameDict()

    function colorFiles(name) {
        if (fileNames[name]) return ".green"
        return ""
    }

    return m("table", {
            style: {
                display: navigate === "triples" ? "block" : "none"
            }
        },
        m("tr",
        m("th.bg-light-silver", {onclick: () => sortTriples("a")}, "A" + sortArrowTriples("a")),
        m("th.bg-light-silver", {onclick: () => sortTriples("b")}, "B" + sortArrowTriples("b")),
        m("th.bg-light-silver", {onclick: () => sortTriples("c")}, "C" + sortArrowTriples("c")),
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
    }, 
        loadingAllFiles && m("div", "Loading Markdown files...")
    )
}

const Ideas = {
    view: () => {
        return m("div.flex.flex-row.h-100.w-100",
            m("div.flex-auto.overflow-y-auto",
                m("div.ma1", 
                    m("button", {onclick: () => navigate = "links"}, "Links"),
                    m("button.ml2", {onclick: () => navigate = "graph"}, "Graph"),
                    m("button.ml2", {onclick: () => navigate = "triples"}, "Triples"),
                    m("button.ml4", {onclick: () => window.location = directoryPath + "?twirlip=filer"}, "Open Filer"),
                    m("button.ml2", {onclick: () => addFile()}, "+ New File")
                ),
                viewLinks(),
                viewTriples(),
                viewGraph()
            ),
            m("div.ma2.flex-none.overflow-y-auto.w-37rem.mw-37rem", // .w-37rem.mw-37rem.
                errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
                loadingAllFiles && m("div.absolute.ma2.pa2.ba.bw2.bg-yellow.flex.items-center", 
                    m("span", "Loading Markdown files..."), 
                    m("span.ml2.spinner-border")
                ),
                viewDirectoryFiles()
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
        window.location = id
    } else {
        updateFilter(id)
    }
}

function storageKeyForNodes() {
    return baseStorageKeyForNodes + "--" + directoryPath
}

function renderCytoscape() {

    const container = document.getElementById("cy")
    if (!container) {
        console.log("no cytoscape container", container)
        return
    }

    const savedPositions = JSON.parse(localStorage.getItem(storageKeyForNodes()) || "{}")

    const elements = []

    const fileNames = makeDirectoryFileNameDict()

    let addedNode = false
    const nodes = {}

    const links = {}

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
        addNode(triple[0])
        addNode(triple[2])
        const key = JSON.stringify({a: triple[0], c: triple[2]})
        if (links[key]) continue
        links[key] = true
        elements.push({
            data: { id: JSON.stringify(triple), source: triple[0], target: triple[2] }
        })
    }

    if (directoryFiles) {
        for (const fileInfo of directoryFiles) {
            for (const index in fileInfo.links) {
                const link = fileInfo.links[index]
                const source = removeExtension(fileInfo.name)
                const target = removeExtension(link)
                addNode(source)
                addNode(target)
                const key = JSON.stringify({a:source, c: target})
                if (links[key]) continue
                links[key] = true
                elements.push({
                    data: { id: JSON.stringify({name: fileInfo.name, link, index}), source, target }
                })
            }
        }
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
    localStorage.setItem(storageKeyForNodes(), JSON.stringify(result))
}

function startup() {
    const startDirectory =  decodeURI(window.location.pathname)
    loadDirectory(startDirectory, "replace")
    m.mount(document.body, Ideas)

    window.addEventListener("storage", () => {
        if (event.key !== storageKeyForNodes()) return
        renderCytoscape()
    })
}

startup()
