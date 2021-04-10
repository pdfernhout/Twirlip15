/* global m */
import "../../vendor/mithril.js"
import { twirlip15ApiCall, Twirlip15Preferences, menuTopBar, menuHoverColor, menuButton, menuCheckbox } from "../../common/twirlip15-support.js"
import Dexie from "../../vendor/dexie.mjs"
import { FileUtils } from "../../common/FileUtils.js"

var previewCache = new Dexie("preview-cache")
previewCache.version(1).stores({
    entries: "&key"
})

const preferences = new Twirlip15Preferences()

let directoryPath = "/"
let directoryFiles = null
let errorMessage = ""
let statusMessage = ""
let showMenu = preferences.get("showMenu", false)
let selectedFiles = {}
let lastSort = "name"
let showHiddenFiles = preferences.get("showHiddenFiles", false)
let showPreview = false
let previews = {}
let previewsToFetch = []

window.onpopstate = async function(event) {
    if (event.state) {
        await loadDirectory(event.state.directoryPath, false)
    } else {
        await loadDirectory("/", false)
    }
}

function showError(error) {
    errorMessage = error
}

function showStatus(messageText) {
    statusMessage = messageText
}


async function loadDirectory(newPath, saveState) {
    clearPreviewFetchQueue()
    if (!newPath.endsWith("/")) {
        newPath = newPath + "/"
    }
    if (newPath.endsWith("/../")) {
        const newPathParts = newPath.split("/")
        newPathParts.pop()
        newPathParts.pop()
        newPathParts.pop()
        newPath = newPathParts.join("/") + "/"
    }
    if (saveState) {
        if (saveState === "replace") {
            history.replaceState({directoryPath: newPath}, newPath, newPath + "?twirlip=filer")
        } else {
            history.pushState({directoryPath: newPath}, newPath, newPath + "?twirlip=filer")
        }
    }
    directoryPath = newPath
    directoryFiles = null
    errorMessage = ""
    const apiResult = await twirlip15ApiCall({request: "file-directory", directoryPath: directoryPath, includeStats: true}, showError)
    if (apiResult) {
        directoryFiles = apiResult.files
        if (directoryPath !== "/") directoryFiles.unshift({name: "..", isDirectory: true})
        lastSort = null
        sortByFileName()
        queuePreviewsIfNeeded()
    }
}

function clearPreviewFetchQueue() {
    previewsToFetch = []
}

function queuePreviewsIfNeeded() {
    if (showPreview) {
        for (const fileInfo of directoryFiles) {
            if (!fileInfo.name.startsWith(".") && !fileInfo.isDirectory && isFilePreviewable(fileInfo.name)) {
                previewsToFetch.push(directoryPath + fileInfo.name)
            }
        }
        setTimeout(fetchNextPreview)
    }
}

async function fetchNextPreview() {
    if (!showPreview) return
    if (!previewsToFetch.length) return
    const nextFileName = previewsToFetch.shift()
    const neededFetching = await fetchFilePreview(nextFileName)
    if (previewsToFetch.length) {
        setTimeout(fetchNextPreview, neededFetching ? 10 : 0)
    } else {
        m.redraw()
    }
}

async function fetchFilePreview(fileName) {
    if (previews[fileName] !== undefined) return false
    previews[fileName] = null
    const resizeOptions = { width: 200, height: 200, fit: "inside", withoutEnlargement: true }
    const key = JSON.stringify({fileName, width: resizeOptions.width, height: resizeOptions.height})
    const cacheEntry = await previewCache.entries.get({key})
    if (cacheEntry) {
        previews[fileName] = cacheEntry.base64Data
        return false
    }
    const apiResult = await twirlip15ApiCall({request: "file-preview", fileName, resizeOptions}, showError)
    if (apiResult) {
        const base64Data = apiResult.base64Data
        previews[fileName] = base64Data
        await previewCache.entries.add({key, base64Data})
    }
    return true
}

function isFilePreviewable(fileName) {
    const fileNameLowerCase = fileName.toLowerCase()
    let isPreviewable = false
    for (const extension of [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".gif", ".svg"]) {
        if (fileNameLowerCase.endsWith(extension)) {
            isPreviewable = true
            break
        }
    }
    return isPreviewable
}

async function newFile() {
    const newFileName = prompt("New file name?")
    if (newFileName) {
        const fileName = directoryPath + newFileName
        const apiResult = await twirlip15ApiCall({request: "file-save", fileName, contents: ""}, showError)
        if (apiResult) loadDirectory(directoryPath, false)
    }
}


async function appendFile(fileName, stringToAppend, encoding) {
    const apiResult = await twirlip15ApiCall({request: "file-append", fileName, stringToAppend, encoding}, showError)
    if (apiResult) {
        return true
    }
    return false
}

let isUploading = false

async function uploadFile() {
    // Could improve so does not read file into memory first so could handle larger files
    showStatus("Reading file from local disk... Please wait...")
    FileUtils.loadFromFile(true, async (filename, contents) => {
        m.redraw()
        // console.log("loadFromFile result", filename, contents, bytes)

        for (const fileInfo of directoryFiles) {
            if (fileInfo.name === filename) {
                showError("A file with that name already exists: " + filename)
                return
            }
        }

        isUploading = true

        const tempFileName = directoryPath + ("Upload-" + new Date().toISOString() + ".temp")
        const finalFileName = directoryPath + filename
        let success = false
        // Chunk size needs to be a multiple of 4 so that base64 data is not corrupted
        const chunkSize = 400000
        for (let i = 0; i < contents.length; i = i + chunkSize) {
            console.log("i", i, i + chunkSize, contents.length, chunkSize, Math.round((i / (contents.length + 1)) * 100) + "%" )
            showStatus("Upload progress: " + Math.round((i / (contents.length + 1)) * 100) + "%" )
            success = await appendFile(tempFileName, contents.substring(i, i + chunkSize), "base64")
            console.log("success in loop", success)
            if (!success) break
        }

        if (success) {
            showStatus("File uploaded almost done; finishing up")
            const apiResult = await twirlip15ApiCall({request: "file-rename", renameFiles: [{oldFileName: tempFileName, newFileName: finalFileName}]}, showError)
            if (apiResult) {
                loadDirectory(directoryPath, false)
                if (!errorMessage) showStatus("Upload finished OK")
            } else {
                if (!errorMessage) showError("Upload failed; problem renaming file")
            } 
        } else {
            showStatus("")
        }

        isUploading = false
    })
}

async function newDirectory() {
    const newFileName = prompt("New directory name?")
    if (newFileName) {
        const fileName = directoryPath + newFileName
        const apiResult = await twirlip15ApiCall({request: "file-new-directory", directoryPath: fileName, contents: ""}, showError)
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
        const apiResult = await twirlip15ApiCall({request: "file-rename", renameFiles: [{oldFileName, newFileName}]}, showError)
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
        const apiResult = await twirlip15ApiCall({request: "file-copy", copyFromFilePath, copyToFilePath}, showError)
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
    const apiResult = await twirlip15ApiCall({request: "file-delete", deleteFiles: Object.keys(selectedFiles)}, showError)
    if (apiResult) {
        selectedFiles = {}
        loadDirectory(directoryPath, false)
    }
}

async function moveFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    const proceed = confirm("Move selected files to current directory:\n" + sortedSelections.join("\n"))
    if (!proceed) return
    const apiResult = await twirlip15ApiCall({request: "file-move", moveFiles: Object.keys(selectedFiles), newLocation: directoryPath}, showError)
    if (apiResult) {
        selectedFiles = {}
        loadDirectory(directoryPath, false)
    }
}

function openAsIdeas() {
    window.location.assign(directoryPath + "?twirlip=ideas")
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
    const selectedFileCount = Object.keys(selectedFiles).length
    return showMenu && menuTopBar([
        menuButton("+ New file", () => newFile()),
        menuButton("⬆ Upload file", () => uploadFile(), isUploading),
        menuButton("+ New directory", () => newDirectory()),
        menuButton("Launch Ideas", () => openAsIdeas()),
        menuButton("Rename", () => renameFile(), selectedFileCount !== 1),
        menuButton("Move", () => moveFiles(), !selectedFileCount),
        menuButton("Copy", () => copyFile(), selectedFileCount !== 1),
        menuButton("Delete", () => deleteFiles(), !selectedFileCount),
        m("br"),
        menuCheckbox("Show hidden files", showHiddenFiles, () => {
            showHiddenFiles = !showHiddenFiles
            preferences.set("showHiddenFiles", showHiddenFiles)
        }),
        menuCheckbox("Show preview", showPreview, () => {
            showPreview = !showPreview
            queuePreviewsIfNeeded()
            // preferences.set("showPreview", showPreview)
        }),
    ])
}

function viewSelectedFiles() {
    const selectedFileCount = Object.keys(selectedFiles).length
    return showMenu && m("div.ma1.ml4",
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
        if (a.name.toLowerCase() === b.name.toLowerCase()) return 0
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
                m("thead",
                    showPreview && m("th.sticky-header.bg-silver"),
                    m("th.sticky-header.bg-silver"),
                    m("th.sticky-header.bg-silver", {onclick: sortByFileName}, "File Name" + sortArrow("name")),
                    m("th.sticky-header.bg-silver", {onclick: sortBySize}, "Size" + sortArrow("size")),
                    m("th.sticky-header.bg-silver", {onclick: sortByTime}, "Modified" + sortArrow("time")),
                    // m("th.sticky-header.bg-silver", "Owner"),
                    // m("th.sticky-header.bg-silver", "Menu")
                ),
                m("tbody",
                    directoryFiles.map(fileInfo => viewFileEntry(fileInfo))
                )
            )
            : m("div", directoryFiles.map(fileInfo => viewFileEntry(fileInfo)))
        : m("div", "Loading file data...")
}

function viewCheckBox(fileName) {
    const hidden = fileName === ".."
    return showMenu && m("input[type=checkbox].mr1" + (hidden ? ".o-0" : ""), {
        checked: selectedFiles[directoryPath + fileName],
        disabled: hidden,
        onclick: () => {
            if (selectedFiles[directoryPath + fileName]) {
                delete selectedFiles[directoryPath + fileName]
            } else {
                selectedFiles[directoryPath + fileName] = true
            }
        }
    })
}

function statsTitle(stats) {
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
        return url + "?twirlip=view-md"
    } else {
        return url
    }
}

function viewFileEntry(fileInfo) { // selectedFiles
    if (!showHiddenFiles && fileInfo.name !== ".." && fileInfo.name.startsWith(".")) return []

    const previewData = previews[directoryPath + fileInfo.name]

    if (showMenu) {
        return m("tr" + (showPreview ? ".h-100px" : ""),
            showPreview && m("td", previewData && m("a.link", {href: viewerForURL(directoryPath + fileInfo.name)}, m("img", { src: "data:image/jpeg;base64," + previewData }))),
            m("td", viewCheckBox(fileInfo.name)),
            m("td", fileInfo.isDirectory
                ? m("span", {onclick: () => loadDirectory(directoryPath + fileInfo.name + "/", true), title: statsTitle(fileInfo.stats)}, "📂 " + fileInfo.name)
                : m("span", 
                    m("a.link", {href: directoryPath + fileInfo.name + "?twirlip=view-edit", title: statsTitle(fileInfo.stats)}, "📄 "), 
                    m("a.link", {href: viewerForURL(directoryPath + fileInfo.name)}, fileInfo.name)
                )
            ),
            m("td.pl2.tr", fileInfo.stats && formatSize(fileInfo.stats.size)),
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
            m("a.link", {href: directoryPath + fileInfo.name + "?twirlip=view-edit", title: statsTitle(fileInfo.stats)}, "📄 "),
            m("a.link", {href: viewerForURL(directoryPath + fileInfo.name)}, fileInfo.name),
        )
}

function viewDirectorySegment(subpath, label) {
    return m("span.dib.mr1" + menuHoverColor, {onclick: () => loadDirectory(subpath, true)}, label)
}

function viewPath(path) {
    const parts = path.split("/")
    let subpath = "/"
    const links = [viewDirectorySegment(subpath, "/")]
    for (const part of parts) {
        if (part) {
            subpath = subpath + part + "/"
            links.push(viewDirectorySegment(subpath, part + " /"))
        }
    }
    return m("span", links)
}

const Filer = {
    view: () => {
        return m("div.pa2.h-100.flex.flex-column",
            errorMessage && m("div.flex-none.red", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            statusMessage && m("div.flex-none.green", m("span", {onclick: () => statusMessage =""}, "✖ "), statusMessage),
            m("div.flex-none", m("span.mr2", {
                onclick: () => {
                    showMenu = !showMenu
                    preferences.set("showMenu", showMenu)
                }}, "☰"), "Files in: ", viewPath(directoryPath)
            ),
            m("div.flex-none", viewMenu()),
            m("div.flex-none", viewSelectedFiles()),
            m("div.flex-auto.overflow-y-auto", viewDirectoryFiles())
        )
    }
}

function startup() {
    const startDirectory =  decodeURI(window.location.pathname)
    loadDirectory(startDirectory, "replace")
    m.mount(document.body, Filer)

    window.addEventListener("storage", (event) => {
        if (!preferences.isPreferenceStorageEvent(event)) return
        showMenu = preferences.get("showMenu", false)
        showHiddenFiles = preferences.get("showHiddenFiles", false)
        // showPreview = preferences.get("showPreview", false)
        m.redraw()
    })
}

startup()
