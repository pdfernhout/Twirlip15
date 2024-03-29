/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import { weaveIntoArray } from "../../common/ModalInputView.js"

const filterModes = ["and", "or", "exact"]

function nextFilterMode(mode) {
    let newModeIndex = filterModes.indexOf(mode) + 1
    if (newModeIndex >= filterModes.length) newModeIndex = 0
    return filterModes[newModeIndex]
}

let directoryPath = "/"
let directoryFiles = null

let errorMessage = ""
let filter = ""
let filterMode = "and"
let loadingAllFiles = true

let loadedCount = 0
let totalCount = 0

function showError(error) {
    errorMessage = error
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

const textFileExtensions = {
    css: true,
    htm: true,
    html: true,
    eml: true,
    json: true,
    jsonl: true,
    latex: true,
    log: true,
    mbox: true,
    md: true,
    text: true,
    txt: true,
    xml: true
}

function fileHasTextExtension(fileName) {
    if (!fileName.includes(".")) return false
    const extension = fileName.split(".").pop().toLowerCase()
    return textFileExtensions[extension] || false
}

async function loadDirectory(newPath) {
    loadingAllFiles = true
    if (!newPath.endsWith("/")) {
        newPath = newPath + "/"
    }
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    const apiResult = await TwirlipServer.fileDirectory(directoryPath, true)
    let localDirectoryFiles = null
    if (apiResult) {
        localDirectoryFiles = apiResult.files.filter(
            fileInfo => !fileInfo.isDirectory 
            && !fileInfo.name.startsWith(".")
            && fileHasTextExtension(fileInfo.name)
        ).sort((a, b) => {
            if (a.name === b.name) return 0
            if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
            if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
            console.log("problem", a, b)
            return 0
            // throw new Error("sort by fileName: unexpected sort case")
        })
        totalCount = localDirectoryFiles.length
    }
    for (let fileInfo of localDirectoryFiles) {
        await loadFileContents(fileInfo)
    }
    directoryFiles = localDirectoryFiles
    loadingAllFiles = false
}

async function loadFileContents(fileInfo) {
    const apiResult = await TwirlipServer.fileContents(directoryPath + fileInfo.name)
    if (apiResult) {
        fileInfo.contents = apiResult.contents
    }
    loadedCount++
}

function satisfiesFilter(fileInfo) {
    const tags = filter.toLowerCase().trim().split(/\s+/)
    if (tags[0] === "") tags.shift()
    if (tags.length === 0) return true

    const contents = (fileInfo.contents || "").toLowerCase()

    if (filterMode === "and") {
        for (let tag of tags) {
            if (!contents.includes(tag)) return false
        }
        return true
    } else if (filterMode === "or") {
        for (let tag of tags) {
            if (contents.includes(tag)) return true
        }
        return false
    } else if (filterMode === "exact") {
        return fileInfo.contents.includes(filter)
    } else {
        throw new Error("filter mode not expected: " + filterMode)
    }
}

function updateFilter(newFilter) {
    filter = newFilter
}

const snippetLength = 100

function makePreviewForSearchTerm(text, searchTerm) {
    const position = (filterMode === "exact")
        ? text.indexOf(searchTerm)
        : text.toLowerCase().indexOf(searchTerm.toLowerCase())
    if (position === -1) return ""
    const start = Math.max(0, position - snippetLength / 2)
    const before = text.substring(start, position)
    const middle = text.substring(position, position + searchTerm.length)
    const after = text.substring(position + searchTerm.length, start + snippetLength)
    return [before, m("b", middle), after]
}

function viewPreview(text) {
    let snippet = ""
    const searchTerms = ((filterMode === "exact")
        ? [filter]
        : filter.trim().split(" "))
    .filter(searchTerm => searchTerm.length)
    if (!searchTerms.length) {
        snippet = text.substring(0, snippetLength)
    } else {
        snippet = searchTerms.map(searchTerm => makePreviewForSearchTerm(text, searchTerm))
            .filter(result => result !== "")
        snippet = weaveIntoArray(snippet, m("hr"))
    }
    return m("div", snippet)
}

function viewFileEntry(fileInfo) {
    if (!satisfiesFilter(fileInfo)) {
        return []
    }
    return m("div.ba.ma2.pa2.br3",
        m("div.mb1",
            m("a.link", {href: fileInfo.name + "?twirlip=edit"}, "✎"),
            m("a.link", {href: fileInfo.name + "?twirlip=edit&mode=view"}, "📄 "),
            m("a", {href: fileInfo.name}, fileInfo.name),
            viewPreview(fileInfo.contents)
        )
    )
}

function viewDirectoryFiles() {
    return directoryFiles
        ? m("div",
            directoryFiles.length === 0
                ? "No text-ish files in directory"
                : m("div",
                    m("div",
                        m("span.mr1", {
                            title: "filter by tag (or file name); click to change and/or mode",
                            onclick: () => filterMode = nextFilterMode(filterMode)
                        }, "show (" + filterMode + "):"),
                        m("input.w-24rem", {
                            value: filter,
                            oninput: event => updateFilter(event.target.value)
                        }),
                        m("span.ml1.pointer", {onclick: () => updateFilter(""), disabled: !filter}, "X")
                    ),
                    directoryFiles.map(fileInfo => viewFileEntry(fileInfo))
                )
        )
        : m("div", "Loading text-ish file data...")
}

const Search = {
    view: () => {
        return m("div.flex.flex-column.h-100.w-100",
            m("div.flex-none", "Path: ", m("i", directoryPath)),
            m("div.ma2.flex-none.overflow-y-auto.w-37rem.mw-37rem", // .w-37rem.mw-37rem.
                errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
                loadingAllFiles && m("div.absolute.ma6.pa2.ba.bw2.bg-yellow.flex.items-center", 
                    m("span", "Loading files... " + 
                    (loadedCount === 0
                        ? ""
                        : loadedCount + " of " + totalCount)), 
                    m("span.ml2.spinner-border")
                ),
                viewDirectoryFiles()
            )
        )
    }
}

async function startup() {
    const pathname =  decodeURI(window.location.pathname)
    directoryPath = pathname
    m.mount(document.body, Search)
    try {
        await loadDirectory(pathname)
    } catch {
        let startDirectory = pathname.match(/(.*)[/\\]/)[1] || ""
        directoryPath = startDirectory
        m.redraw()
        await loadDirectory(startDirectory)
    }
}

startup()
