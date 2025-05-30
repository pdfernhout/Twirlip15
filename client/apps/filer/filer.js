/* global m, md5 */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import * as FileUploader from "../../common/FileUploader.js"
import { menuTopBar, menuHoverColor, menuButton, menuCheckbox, viewSelect } from "../../common/menu.js"
import { Twirlip15Preferences } from "../../common/Twirlip15Preferences.js"
import Dexie from "../../vendor/dexie.mjs"
import { FileUtils } from "../../common/FileUtils.js"
import "../../vendor/md5.js"
import { ModalInputView, modalAlert, modalConfirm, modalPrompt, customModal } from "../../common/ModalInputView.js"
import { applicationList, extensionForApplication } from "./applicationList.js"

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
let showHiddenFiles = preferences.get("showHiddenFiles", false)
let showPreview = false
let previews = {}
let previewsToFetch = []
const filterStoragePrefix = "twirlip15_filter_"

window.onpageshow = function(event) {
    if (event.persisted) {
        loadDirectory(directoryPath, false)
    }
}

window.onpopstate = async function(event) {
    if (event.state) {
        await loadDirectory(event.state.directoryPath, false)
    } else {
        // Probably unexpected hash change from # in url
        await loadDirectory(directoryPath, false)
    }
}

function navigateToURL(url) {
    console.log("navigateToURL", url)
    window.location = url
}

function showError(error) {
    errorMessage = error
}

function showStatus(messageText) {
    statusMessage = messageText
}


const FavoriteDirectoriesPreferenceString = "filer-favoriteDirectories"

function getFavoriteDirectories() {
    const favorites = preferences.get(FavoriteDirectoriesPreferenceString, {})
    return favorites
}

function setFavoriteDirectories(favorites) {
    preferences.set(FavoriteDirectoriesPreferenceString, favorites)
}

const MaxRecentDirectories = 20
const RecentFilePreferenceString = "filer-recentFiles"

function getSortForDirectory() {
    const recent = preferences.get(RecentFilePreferenceString, {})
    return (recent[directoryPath] && recent[directoryPath].sort) || "name" 
}

function setSortForDirectory(sort) {
    const recent = preferences.get(RecentFilePreferenceString, {})

    // Limit amount of past history
    const match = recent[directoryPath] ? 0 : 1
    while (Object.keys(recent).length > MaxRecentDirectories - match) {
        let oldestDir = null
        let oldestTimestamp = new Date().toISOString() 
        for (const dir of Object.keys(recent)) {
            if (recent[dir].timestamp <= oldestTimestamp) {
                oldestTimestamp = recent[dir].timestamp
                oldestDir = dir
            }
        }
        if (oldestDir) {
            delete recent[oldestDir]
        } else {
            break
        }
    }
    recent[directoryPath] = { sort, timestamp: new Date().toISOString() }
    return preferences.set(RecentFilePreferenceString, recent)
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

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
    const apiResult = await TwirlipServer.fileDirectory(directoryPath, true)
    if (apiResult) {
        directoryFiles = apiResult.files
        if (directoryPath !== "/") directoryFiles.unshift({name: "..", isDirectory: true})
        sortFiles()
        queuePreviewsIfNeeded()
    }
}

function clearPreviewFetchQueue() {
    previewsToFetch = []
}

function queuePreviewsIfNeeded() {
    clearPreviewFetchQueue()
    if (showPreview) {
        const selectedFileNames = Object.keys(selectedFiles)
        for (const fileInfo of directoryFiles) {
            if (selectedFileNames.length && !selectedFiles[filePathForFileInfo(fileInfo)]) continue
            if (!fileInfo.name.startsWith(".") && !fileInfo.isDirectory && isFilePreviewable(fileInfo.name)) {
                previewsToFetch.push(filePathForFileInfo(fileInfo))
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
    const apiResult = await TwirlipServer.filePreview(fileName, resizeOptions)
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

function checkIfFileAlreadyExists(newFileName) {
    for (const fileInfo of directoryFiles) {
        if (fileInfo.name === newFileName) {
            return true
        }
    }
    return false
}

async function newFile() {
    let newFileName = ""
    let openWithApplication = ""

    function applicationChanged(value) {
        const oldExtension = extensionForApplication[openWithApplication]
        if (oldExtension && newFileName.endsWith(oldExtension)) {
            newFileName = newFileName.slice(0, -oldExtension.length)
        }
        openWithApplication = value
        if (!newFileName 
            || !newFileName.includes(".")
            || newFileName.startsWith("Unnamed.twirlip-")
            || newFileName === "Unnamed.txt"
        ) {
            const name = newFileName || "Unnamed"
            const extension = extensionForApplication[value]
            if (extension) newFileName = name + extension
        }
    }

    const ok = await customModal((resolve) => {
        return m("div",
            m("h3", "New file name?"),
            m("label.flex.items-center", 
                m("span.mr2", "Name: "),
                m("input.flex-grow-1", {
                    value: newFileName, 
                    oninput: event => newFileName = event.target.value,
                    oncreate: (vnode) => {
                        const input = vnode.dom
                        input.focus()
                        input.selectionStart = 0
                        input.selectionEnd = newFileName.length
                    },
                    // TODO: Handle escape or enter even if no input
                    onkeydown: (event) => {
                        if (event.keyCode === 13) {
                            // enter
                            resolve(true)
                            return false
                        } else if (event.keyCode === 27) {
                            // escape
                            resolve(null)
                            return false
                        }
                        return true
                    },
                }),
            ),
            m("div.pa2"),
            m("label",
                "Open with: ",
                viewSelect(applicationList, openWithApplication, applicationChanged)
            ),
            m("div.pa2"),
            m("div.ma2.flex.justify-end", 
                m("button", { onclick: () => resolve(false)}, "Cancel"),
                m("button.ml2", { onclick: () => resolve(true)}, "OK")
            )
        )
    })
    if (ok && newFileName) {
        if (checkIfFileAlreadyExists(newFileName)) {
            showError("A file with that name already exists: " + newFileName)
            return
        }
        const fileName = directoryPath + newFileName
        const apiResult = await TwirlipServer.fileSave(fileName, "")
        if (apiResult) {
            if (openWithApplication) {
                navigateToURL(newFileName + "?twirlip=" + openWithApplication)
            } else {
                await loadDirectory(directoryPath, false)
            }
        }
    }
}

let isUploading = false

async function uploadFile() {
    // Could improve so does not read file into memory first so could handle larger files
    showStatus("Reading file from local disk... Please wait...")
    FileUtils.loadFromFile(true, async (fileName, base64Contents) => {
        m.redraw()

        if (checkIfFileAlreadyExists(fileName)) {
            showError("A file with that name already exists: " + fileName)
            return
        }

        isUploading = true

        const uploadResult = await FileUploader.uploadFileFromBase64Contents(TwirlipServer, base64Contents, directoryPath, fileName, showStatus)

        if (uploadResult) {
            loadDirectory(directoryPath, false)
            if (!errorMessage) showStatus("Upload finished OK")
        } else if (uploadResult === false) {
            if (!errorMessage) showError("Upload failed; problem renaming file")
        } else {
            showStatus("")
        }

        isUploading = false
    })
}

async function newDirectory() {
    const newFileName = await modalPrompt("New directory name?")
    if (newFileName) {
        if (checkIfFileAlreadyExists(newFileName)) {
            showError("A file with that name already exists: " + newFileName)
            return
        }
        const fileName = directoryPath + newFileName
        const apiResult = await TwirlipServer.fileNewDirectory(fileName)
        if (apiResult) loadDirectory(directoryPath, false)
    }
}

function fileNameFromPath(filePath) {
    return filePath.split(/(\\|\/)/g).pop()
}

async function renameFile() {
    const fileNameBefore = fileNameFromPath(Object.keys(selectedFiles)[0])
    const fileNameAfter = await modalPrompt("New file name after rename?", fileNameBefore)
    if (fileNameAfter) {
        if (checkIfFileAlreadyExists(fileNameAfter)) {
            showError("A file with that name already exists: " + fileNameAfter)
            return
        }
        const oldFileName = directoryPath + fileNameBefore
        const newFileName = directoryPath + fileNameAfter
        const apiResult = await TwirlipServer.fileRenameOne(oldFileName, newFileName)
        if (apiResult) {
            selectedFiles = {}
            loadDirectory(directoryPath, false)
        }
    }
}

async function copyFile() {
    const copyFromFilePath = Object.keys(selectedFiles)[0]
    const copyFromFileName = fileNameFromPath(copyFromFilePath)
    const copyToFileName = await modalPrompt("New file name for copy?", copyFromFileName)
    if (copyToFileName) {
        const copyToFilePath = directoryPath + copyToFileName
        const apiResult = await TwirlipServer.fileCopy(copyFromFilePath, copyToFilePath)
        if (apiResult) {
            selectedFiles = {}
            loadDirectory(directoryPath, false)
        }
    }
}

async function deleteFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    const proceed = await modalConfirm("Delete selected files:\n" + sortedSelections.join("\n"))
    if (!proceed) return
    const apiResult = await TwirlipServer.fileDelete(Object.keys(selectedFiles))
    if (apiResult) {
        selectedFiles = {}
        loadDirectory(directoryPath, false)
    }
}

async function moveFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    const proceed = await modalConfirm("Move selected files to current directory:\n" + sortedSelections.join("\n"))
    if (!proceed) return
    const apiResult = await TwirlipServer.fileMove(Object.keys(selectedFiles), directoryPath)
    if (apiResult) {
        selectedFiles = {}
        loadDirectory(directoryPath, false)
    }
}

async function launchApplication(id) {
    const fileNames = Object.keys(selectedFiles)
    if (fileNames.length > 1) {
        return await modalAlert("At most one file must be selected to launch an application")
    }
    const fileName = fileNames.length ? fileNames[0] : directoryPath
    navigateToURL(fileName + "?twirlip=" + id)
}

async function showSelectedFiles() {
    const sortedSelections = Object.keys(selectedFiles).sort()
    await modalAlert("Selected files:\n" + sortedSelections.join("\n"))
}

function selectAll() {
    visibleFiles().forEach(fileInfo => {
        if (fileInfo.name !== "..") selectedFiles[filePathForFileInfo(fileInfo)] = true
    })
}

function dropdownMenu(label, options, callback, disabled) {
    return [
        m("select.ml2.mr2.mw4", { value: "", disabled, onchange: event => {
            callback(event.target.value) 
        }},
        m("option", { value: ""}, label),
        options.map(option => {
            if (option.label) {
                return m("option", { value: option.value }, option.label)
            } else {
                return m("option", { value: option }, option)
            }
        })
    )]
}

function viewMenu() {
    const selectedFileCount = Object.keys(selectedFiles).length
    return showMenu && menuTopBar([
        menuButton("+New directory", () => newDirectory()),
        menuButton("+New file", () => newFile()),
        menuButton("⬆Upload file", () => uploadFile(), isUploading),
        dropdownMenu("▶Launch", applicationList, (id) => launchApplication(id), selectedFileCount > 1),
        menuButton("✎Rename", () => renameFile(), selectedFileCount !== 1),
        menuButton("➛Move", () => moveFiles(), !selectedFileCount),
        menuButton("⎘Copy", () => copyFile(), selectedFileCount !== 1),
        menuButton("✂Delete", () => deleteFiles(), !selectedFileCount),
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
        m("label.ml3",
            "Filter:", 
            m("input", { 
                value: getFilterForCurrentDirectory(), 
                oninput: event => {
                    setFilterForCurrentDirectory(event.target.value)
                }
            }), 
            m("span.ml1" + (getFilterForCurrentDirectory() ? ".pointer" : ""), {
                onclick: () => setFilterForCurrentDirectory("")
            }, "X")
        ),
    ])
}

function viewSelectedFiles() {
    const selectedFileCount = Object.keys(selectedFiles).length
    return showMenu && m("div.ma1.pl2.pr2",
        "Selected file count: ",
        selectedFileCount,
        m("button.ml2", {onclick: () => selectAll(), }, "Select All"),
        m("button.ml2", {onclick: () => selectedFiles = {}, disabled: !selectedFileCount}, "Clear"),
        m("button.ml2", {onclick: () => showSelectedFiles(), disabled: !selectedFileCount}, "Show")
    )
}

function sortFiles() {
    const sortBy = getSortForDirectory()
    if (sortBy.startsWith("name")) directoryFiles.sort(sortByFileName)
    else if (sortBy.startsWith("size")) directoryFiles.sort(sortBySize)
    else if (sortBy.startsWith("time")) directoryFiles.sort(sortByTime)
    else throw new Error("Unexpected sort: " + sortBy)

    if (sortBy.endsWith("-reversed")) directoryFiles.reverse()
}

function sortByFileName(a, b) {
    if (a.name.toLowerCase() === b.name.toLowerCase()) return 0
    if (a.name === ".." && b.name !== "..") return -1
    if (a.name !== ".." && b.name === "..") return 1
    if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
    if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
    throw new Error("sortByFileName: unexpected sort case")
}

function sortBySize(a, b) {
    if (!a.stats && !b.stats) return 0
    if (!a.stats) return -1
    if (!b.stats) return 1
    return a.stats.size - b.stats.size
}

function sortByTime(a, b) {
    if (!a.stats && !b.stats) return 0
    if (!a.stats) return -1
    if (!b.stats) return 1
    if (a.stats.mtimeMs < b.stats.mtimeMs) return -1
    if (a.stats.mtimeMs > b.stats.mtimeMs) return 1
    return 0
}

function sortByFileNameClicked() {
    getSortForDirectory() === "name"
        ? setSortForDirectory("name-reversed")
        : setSortForDirectory("name")
    sortFiles()
}

function sortBySizeClicked() {
    getSortForDirectory() === "size"
        ? setSortForDirectory("size-reversed")
        : setSortForDirectory("size")
    sortFiles()
}

function sortByTimeClicked() {
    getSortForDirectory() === "time"
        ? setSortForDirectory("time-reversed")
        : setSortForDirectory("time")
    sortFiles()
}

function sortArrow(field) {
    if (field === getSortForDirectory()) return "↓"
    if (field + "-reversed" === getSortForDirectory()) return "↑"
    return ""
}

function getFilterForCurrentDirectory() {
    return sessionStorage.getItem(filterStoragePrefix + directoryPath) || ""
}

function setFilterForCurrentDirectory(filter) {
    if (filter) {
        sessionStorage.setItem(filterStoragePrefix + directoryPath, filter)
    } else {
        sessionStorage.removeItem(filterStoragePrefix + directoryPath)
    }
}

function visibleFiles() {
    const filter = getFilterForCurrentDirectory()
    return directoryFiles
        .filter(fileInfo => showHiddenFiles || !fileInfo.name.startsWith("."))
        .filter(fileInfo => !filter || fileInfo.name.toLowerCase().includes(filter.toLowerCase()))
}

function viewFileEntries() {
    return visibleFiles()
        .map(fileInfo => viewFileEntry(fileInfo))
}

function viewDirectoryFiles() {
    return directoryFiles
        ? showMenu 
            ? m("table", 
                m("thead",
                    showPreview && m("th.sticky-header.bg-silver"),
                    m("th.sticky-header.bg-silver"),
                    m("th.sticky-header.bg-silver", {onclick: sortByFileNameClicked}, "File Name" + sortArrow("name")),
                    m("th.sticky-header.bg-silver", {onclick: sortBySizeClicked}, "Size" + sortArrow("size")),
                    m("th.sticky-header.bg-silver", {onclick: sortByTimeClicked}, "Modified" + sortArrow("time")),
                    // m("th.sticky-header.bg-silver", "Owner"),
                    // m("th.sticky-header.bg-silver", "Menu")
                ),
                m("tbody",
                    viewFileEntries()
                )
            )
            : m("div", viewFileEntries())
        : m("div", "Loading file data...")
}

function viewCheckBox(fileInfo) {
    const hidden = fileInfo.name === ".."
    const filePath = filePathForFileInfo(fileInfo)
    return showMenu && m("input[type=checkbox].mr1" + (hidden ? ".o-0" : ""), {
        checked: selectedFiles[filePath],
        disabled: hidden,
        onclick: () => {
            if (selectedFiles[filePath]) {
                delete selectedFiles[filePath]
            } else {
                selectedFiles[filePath] = true
            }
        }
    })
}

function statsTitle(fileInfo) {
    const stats = fileInfo.stats
    if (!stats) return undefined
    // return JSON.stringify(fileInfo.stats, null, 4)
    return JSON.stringify({
        name: fileInfo.name,
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
    // Convert to local timestamp but using ISO format (used by Sweden)
    time = new Date(time).toLocaleString("sv")
    // note: the T is replaced by a special non-breaking thin space
    return time.replace("Z", " ").replace("T", " ").split(".")[0]
}

function isInLocalDownloadsDirectory(urlFilePath) {
    if (!window.location.host.toLowerCase().includes("localhost")) return false
    if (!urlFilePath.toLowerCase().includes("/download")) return false
    return true
}

function viewerForURL(url) {
    const lowercaseURL = String(url.toLowerCase())
    for (let appName of applicationList) {
        if (lowercaseURL.endsWith(".twirlip.jsonl")) {
            return url + "?twirlip=twirlip"
        }
        if (lowercaseURL.endsWith(".twirlip-" + appName + ".jsonl")) {
            return url + "?twirlip=" + appName
        }
    }
    if (url.endsWith(".md")) {
        return url + "?twirlip=view-md"
    } else {
        let subdomain = ""
        // Add subdomain for extra origin security if locally download file
        if (isInLocalDownloadsDirectory(url)) subdomain = md5(url) + ".download."
        return window.location.protocol + "//" + subdomain + window.location.host + url
    }
}

function encodeHashes(path) {
    return path.replaceAll("#", "%23")
}

function filePathForFileInfo(fileInfo) {
    return directoryPath + fileInfo.name + (fileInfo.isDirectory ? "/" : "")
}


function viewFileEntry(fileInfo) { // selectedFiles
    const previewData = previews[filePathForFileInfo(fileInfo)]

    if (showMenu) {
        return m("tr" + (showPreview ? ".h-100px" : ""),
            showPreview && m("td", previewData && m("a.link", {href: viewerForURL(filePathForFileInfo(fileInfo))}, m("img", { src: "data:image/jpeg;base64," + previewData }))),
            m("td", viewCheckBox(fileInfo)),
            m("td.mw6", fileInfo.isDirectory
                ? m("span", {onclick: () => loadDirectory(filePathForFileInfo(fileInfo), true), title: statsTitle(fileInfo)}, "📂 " + fileInfo.name)
                : m("span", 
                    m("a.link", {href: filePathForFileInfo(fileInfo) + "?twirlip=edit", title: statsTitle(fileInfo)}, "📄 "), 
                    m("a.link", {href: viewerForURL(encodeHashes(filePathForFileInfo(fileInfo)))}, fileInfo.name)
                )
            ),
            m("td.pl2.tr", fileInfo.stats && formatSize(fileInfo.stats.size)),
            m("td.pl2", fileInfo.stats && formatTime(fileInfo.stats.mtimeMs)),
            // m("td", fileInfo.stats && fileInfo.stats.uid),
            // m("td", "MENU")
        )
    }

    return fileInfo.isDirectory
        ? m("div",
            viewCheckBox(fileInfo),
            m("span", {onclick: () => loadDirectory(filePathForFileInfo(fileInfo), true), title: statsTitle(fileInfo)}, "📂 " + fileInfo.name)
        )
        : m("div",
            viewCheckBox(fileInfo), 
            m("a.link", {href: filePathForFileInfo(fileInfo) + "?twirlip=edit", title: statsTitle(fileInfo)}, "📄 "),
            m("a.link", {href: viewerForURL(filePathForFileInfo(fileInfo))}, fileInfo.name),
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

function toggleFavorite() {
    const favorites = getFavoriteDirectories()
    if (favorites[directoryPath]) {
        delete favorites[directoryPath]
    } else {
        favorites[directoryPath] = new Date().toISOString()
    }
    setFavoriteDirectories(favorites)
}

function viewFavorites() {
    const favorites = getFavoriteDirectories()
    const isFavorite = favorites[directoryPath]
    const favoritesArray = Object.keys(favorites).sort()
    return m("span",  
        dropdownMenu("Favorites", favoritesArray, recentDirectory => (recentDirectory !== directoryPath) && loadDirectory(recentDirectory, true), favoritesArray.length < 1),
        m("span.mr3", {onclick: toggleFavorite }, isFavorite ? "★" : "☆")
    )
}

const Filer = {
    view: () => {
        return m("div.h-100.flex.flex-column",
            errorMessage && m("div.flex-none.red", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            statusMessage && m("div.flex-none.green", m("span", {onclick: () => statusMessage =""}, "✖ "), statusMessage),
            m("div.flex-none.pt1.pb1.bg-light-green", 
                m("span.ma2", {
                    onclick: () => {
                        showMenu = !showMenu
                        preferences.set("showMenu", showMenu)
                    }}, "☰"),
                showMenu && viewFavorites(),
                viewPath(directoryPath),
            ),
            m("div.flex-none", viewMenu()),
            m(ModalInputView),
            m("div.flex-none", viewSelectedFiles()),
            m("div.pl2.pr2.flex-auto.overflow-y-auto", viewDirectoryFiles())
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
