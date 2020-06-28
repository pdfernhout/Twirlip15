/* global m */
import "./vendor/mithril.js"

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = ""
let chosenFileLoaded = false
let editing = false
let editedContents = ""
let fileSaveInProgress = false
let showMenu = false
let selectedFiles = {}
let partialFileTest = ""
let lastSort = "name"

window.onpopstate = async function(event) {
    if (event.state) {
        console.log("onpopstate", event.state)
        showMenu = event.state.showMenu || false
        await loadDirectory(event.state.directoryPath, false)
        if (event.state.chosenFileName) {
            await loadFileContents(event.state.chosenFileName, false)
        }
    } else {
        await loadDirectory("/", false)
    }
}

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

async function loadDirectory(newPath, saveState) {
    if (newPath.endsWith("/../")) {
        const newPathParts = newPath.split("/")
        newPathParts.pop()
        newPathParts.pop()
        newPathParts.pop()
        newPath = newPathParts.join("/") + "/"
    }
    if (saveState) {
        const urlParams = new URLSearchParams(window.location.search)
        urlParams.set("dir", newPath)
        // window.location.search = urlParams.toString()
        if (saveState === "replace") {
            history.replaceState({directoryPath: newPath, showMenu}, newPath, "?" + urlParams.toString())
        } else {
            history.pushState({directoryPath: newPath, showMenu}, newPath, "?" + urlParams.toString())
        }
    }
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    chosenFileName = ""
    chosenFileContents = null
    chosenFileLoaded = false
    editing = false
    const apiResult = await apiCall({request: "file-directory", directoryPath: directoryPath, includeStats: true})
    if (apiResult) {
        directoryFiles = apiResult.files
        if (directoryPath !== "/") directoryFiles.unshift({name: "..", isDirectory: true})
        lastSort = null
        sortByFileName()
    }
}

async function loadPartialFileTest(fileName) {
    const apiResult = await apiCall({request: "file-read-bytes", fileName: fileName, length: 4096})
    if (apiResult) {
        partialFileTest = apiResult.data
    }
}

async function loadFileContents(newFileName, saveState) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    editing = false
    partialFileTest = ""
    if (saveState) {
        history.pushState({directoryPath, chosenFileName, showMenu}, directoryPath)
    }
    const apiResult = await apiCall({request: "file-contents", fileName: chosenFileName})
    if (apiResult) {
        chosenFileContents = apiResult.contents
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
    }
}

async function appendFile(fileName, stringToAppend, successCallback) {
    if (fileSaveInProgress) return
    fileSaveInProgress = true
    const apiResult = await apiCall({request: "file-append", fileName, stringToAppend})
    fileSaveInProgress = false
    if (apiResult) {
        successCallback()
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

function fileNameFromPath(filePath) {
    return filePath.split(/(\\|\/)/g).pop()
}

async function renameFile() {
    const fileNameBefore = fileNameFromPath(Object.keys(selectedFiles)[0])
    const fileNameAfter = prompt("New file name after rename?", fileNameBefore)
    if (fileNameAfter) {
        const oldFileName = directoryPath + fileNameBefore
        const newFileName = directoryPath + fileNameAfter
        const apiResult = await apiCall({request: "file-rename", renameFiles: [{oldFileName, newFileName}]})
        if (apiResult) {
            selectedFiles = {}
            loadDirectory(directoryPath, false)
        }
    }
}

async function copyFile() {
    const copyFromFilePath = Object.keys(selectedFiles)[0]
    const copyFromFileName = fileNameFromPath(copyFromFilePath)
    const copyToFileName = prompt("New file name for copy?", copyFromFileName)
    if (copyToFileName) {
        const copyToFilePath = directoryPath + copyToFileName
        const apiResult = await apiCall({request: "file-copy", copyFromFilePath, copyToFilePath})
        if (apiResult) {
            selectedFiles = {}
            loadDirectory(directoryPath, false)
        }
    }
}

async function deleteFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    const proceed = confirm("Delete selected files:\n" + sortedSelections.join("\n"))
    if (!proceed) return
    const apiResult = await apiCall({request: "file-delete", deleteFiles: Object.keys(selectedFiles)})
    if (apiResult) {
        selectedFiles = {}
        loadDirectory(directoryPath, false)
    }
}

async function moveFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    const proceed = confirm("Move selected files to current directory:\n" + sortedSelections.join("\n"))
    if (!proceed) return
    const apiResult = await apiCall({request: "file-move", moveFiles: Object.keys(selectedFiles), newLocation: directoryPath})
    if (apiResult) {
        selectedFiles = {}
        loadDirectory(directoryPath, false)
    }
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

function disabled(flag) {
    return flag ? ".disabled-button" : ""
}

function viewMenu() {
    const selectedFileCount = Object.keys(selectedFiles).length
    const hoverColor = ".hover-bg-orange"
    return showMenu && m("div.ml4.bg-light-green.w-12rem",
        m("div" + hoverColor, {onclick: () => addFile()}, "+📄 Add file"),
        m("div" + hoverColor, {onclick: () => addDirectory()}, "+📂 Add directory"),
        m("div" + hoverColor + disabled(selectedFileCount !== 1), {onclick: () => renameFile()}, "* Rename"),
        m("div" + hoverColor + disabled(!selectedFileCount), {onclick: () => moveFiles()}, "* Move"),
        m("div" + hoverColor + disabled(selectedFileCount !== 1), {onclick: () => copyFile()}, "* Copy"),
        m("div" + hoverColor + disabled(!selectedFileCount), {onclick: () => deleteFiles()}, "* Delete")
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

function sortByFileName() {
    lastSort === "name"
        ? lastSort = "name-reversed"
        : lastSort = "name"
    directoryFiles.sort((a, b) => {
        if (a.name === b.name) return 0
        if (a.name === ".." && b.name !== "..") return -1
        if (a.name !== ".." && b.name === "..") return 1
        if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
        if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
        throw new Error("sortByFileName: unexpected sort case")
    })
    if (lastSort === "name-reversed") directoryFiles.reverse()
}

function sortBySize() {
    directoryFiles.sort((a, b) => {
        if (!a.stats && !b.stats) return 0
        if (!a.stats) return -1
        if (!b.stats) return 1
        return a.stats.size - b.stats.size
    })
    lastSort === "size"
        ? lastSort = "size-reversed"
        : lastSort = "size"
    if (lastSort === "size-reversed") directoryFiles.reverse()
}

function sortByTime() {
    directoryFiles.sort((a, b) => {
        if (!a.stats && !b.stats) return 0
        if (!a.stats) return -1
        if (!b.stats) return 1
        if (a.stats.mtime < b.stats.mtime) return -1
        if (a.stats.mtime > b.stats.mtime) return 1
        return 0
    })
    lastSort === "time"
        ? lastSort = "time-reversed"
        : lastSort = "time"
    if (lastSort === "time-reversed") directoryFiles.reverse()
}

function sortArrow(field) {
    if (field === lastSort) return "↓"
    if (field + "-reversed" === lastSort) return "↑"
    return ""
}

function viewDirectoryFiles() {
    return directoryFiles
        ? showMenu 
            ? m("table", 
                m("tr",
                    m("th", ""),
                    m("th", {onclick: sortByFileName}, "File Name" + sortArrow("name")),
                    m("th", {onclick: sortBySize}, "Size" + sortArrow("size")),
                    m("th", {onclick: sortByTime}, "Modified" + sortArrow("time")),
                    // m("th", "Owner"),
                    // m("th", "Menu")
                ),
                directoryFiles.map(fileInfo => viewFileEntry(fileInfo))
            )
            : m("div", directoryFiles.map(fileInfo => viewFileEntry(fileInfo)))
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

function statsTitle(stats) {
    // console.log("stats", stats)
    if (!stats) return undefined
    // return JSON.stringify(fileInfo.stats, null, 4)
    return JSON.stringify({
        size: stats.size,
        creationTime: stats.ctime,
        modifiedTime: stats.mtime,
        accessTime: stats.atime,
        ownerUID: stats.uid
    }, null, 4)
}

function formatSize(size) {
    const text = "" + size
    // Put comma in every three numbers
    return text.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1,")
}

function formatTime(time) {
    // note: the T is replaced by a special non-breaking thin space
    return time.replace("Z", " ").replace("T", " ")
}

function viewerForURL(url) {
    if (url.endsWith(".md")) {
        return "/twirlip15/view-md.html?file=" + url
    } else {
        return url
    }
}

function viewFileEntry(fileInfo) { // selectedFiles
    if (showMenu) {
        return m("tr",
            m("td", viewCheckBox(fileInfo.name)),
            m("td", fileInfo.isDirectory
                ? m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/", true), title: statsTitle(fileInfo.stats)}, "📂 " + fileInfo.name)
                : m("span", {onclick: () => loadFileContents(directoryPath + fileInfo.name, true), title: statsTitle(fileInfo.stats)}, "📄 ", m("a.link", {href: directoryPath + fileInfo.name}, fileInfo.name))
            ),
            m("td.tr.pl2", fileInfo.stats && formatSize(fileInfo.stats.size)),
            m("td.pl2", fileInfo.stats && formatTime(fileInfo.stats.mtime)),
            // m("td", fileInfo.stats && fileInfo.stats.uid),
            // m("td", "MENU")
        )
    }

    return fileInfo.isDirectory
        ? m("div",
            viewCheckBox(fileInfo.name),
            m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/", true), title: statsTitle(fileInfo.stats)}, "📂 " + fileInfo.name)
        )
        : m("div",
            viewCheckBox(fileInfo.name), 
            m("span", {onclick: () => loadFileContents(directoryPath + fileInfo.name, true), title: statsTitle(fileInfo.stats)}, "📄 "),
            m("a.link", {href: viewerForURL(directoryPath + fileInfo.name)}, fileInfo.name),
        )
}

function viewFileContents() {
    return m("div",
        (chosenFileContents === null) && m("div", "Loading file contents..."),
        (!chosenFileLoaded && chosenFileContents === "") && m("div", 
            m("button", {onclick: () => loadPartialFileTest(chosenFileName)}, "Load partial file test"),
            partialFileTest && m("div.break-word", partialFileTest)
        ),
        chosenFileLoaded && m("div",
            m("div",
                m("button", {onclick: () => editing = false, disabled: !editing}, "View"),
                m("button.ml1", {onclick: () => {
                    editing = true
                    editedContents = chosenFileContents
                }, disabled:  editing}, "Edit"),
                m("button.ml1", {onclick: () => { 
                    appendFile(chosenFileName, editedContents, () => {
                        chosenFileContents = chosenFileContents + editedContents
                        editedContents = ""
                    })
                }, disabled: !editing || fileSaveInProgress}, "Append"),
                m("button.ml1", {onclick: () => { 
                    saveFile(chosenFileName, editedContents, () => chosenFileContents = editedContents)
                }, disabled: !editing || fileSaveInProgress}, "Save"),
                m("button.ml1", {onclick: () => { 
                    chosenFileName = ""
                    chosenFileContents = null
                    history.back()
                }, disabled: fileSaveInProgress}, "Close"),
                fileSaveInProgress && m("span.yellow", "Saving...")
            ),
            editing
                ? m("textarea.w-90", {style: {height: "400px"}, value: editedContents, onchange: event => editedContents = event.target.value})
                : m("pre.ml2.pre-wrap", chosenFileContents)
        )
    )
}

const Filer = {
    view: () => {
        return m("div.ma2",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div",
                m("div", m("span.mr2", {onclick: () => {
                    showMenu = !showMenu
                    history.pushState({directoryPath, showMenu}, directoryPath)
                }
            }, "☰"), "Files in: ", directoryPath),
                viewMenu(),
                viewSelectedFiles(),
                viewDirectoryFiles()
            ),
            chosenFileName && m("div",
                chosenFileName && m("div.ml2.mt2", "Chosen file: " , chosenFileName),
                viewFileContents()
            )
        )
    }
}

m.mount(document.body, Filer)

const urlParams = new URLSearchParams(window.location.search)
const startDirectory =  urlParams.get("dir") || "/"

loadDirectory(startDirectory, "replace")
