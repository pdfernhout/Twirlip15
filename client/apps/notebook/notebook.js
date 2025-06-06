"use strict"

/* global m, ace */

// defines ace
import "../../vendor/ace-src-noconflict/ace.js"

// Needed so ace can load editor definitions for different file types
ace.config.set("basePath", "/twirlip15/vendor/ace-src-noconflict") 

// defines modelist indirectly so ace can require it
import "../../vendor/ace-src-noconflict/ext-modelist.js"

const modelistWrapper = {
    modelist: null
}

ace.require(["ace/ext/modelist"], function (modelist) {
    modelistWrapper.modelist = modelist
    m.redraw()
})

// Mithril only needs to be imported once in the application as it sets a global "m"
// defines m
import "../../vendor/mithril.js"

// sha256 only needs to be imported once in the application as it sets a global sha256
import "../../vendor/sha256.js"

import { Toast } from "../../common/Toast.js"
import { ItemStoreUsingServerFiles } from "../../common/ItemStoreUsingServerFiles.js"

import { NotebookView } from "./NotebookView.js"
import { NotebookBackend } from "./NotebookBackend.js"
import { StoreUsingLocalStorage } from "./StoreUsingLocalStorage.js"
import { FileUtils } from "../../common/FileUtils.js"
import { HashUtils } from "../../common/HashUtils.js"
import { CanonicalJSON } from "../../common/CanonicalJSON.js"
import { UUID } from "../../common/UUID.js"

import { menu, popup } from "./popup.js"

let initialKeyToGoTo = null

const NotebookUsingMemory = NotebookBackend()
const NotebookUsingLocalStorage = NotebookBackend(StoreUsingLocalStorage(m.redraw))

function showError(error) {
    Toast.toast(error)
}

const filePathFromParams = decodeURI(window.location.pathname)
console.log("about to setup link to server", new Date().toISOString())
const itemStore = ItemStoreUsingServerFiles(showError, m.redraw, null, filePathFromParams, () => Toast.toast("loading notebook file failed"))
const NotebookUsingServer = NotebookBackend(itemStore, function () {
    // assuming callback will always be done before get here to go to initialKeyToGoTo
    if (launchItem) {
        runStartupItem(launchItem)
        launchItem = null
        m.redraw()
    } else if (initialKeyToGoTo && notebookView.getNotebookChoice() === "server") {
        notebookView.goToKey(initialKeyToGoTo)
        m.redraw()
    } else {
        m.redraw()
    }
})

let notebookView = NotebookView(NotebookUsingLocalStorage, ace, modelistWrapper)

let launchItem = null

function getItemForJSON(itemJSON) {
    if (itemJSON === null) return null
    if (itemJSON.startsWith("{")) {
        try {
            return JSON.parse(itemJSON)
        } catch (e) {
            // fall through
        }
    }
    const newItem = notebookView.newItem()
    newItem.value = itemJSON
    return newItem
}

function setupTwirlip7Global() {
    // setup Twirlip7 global for use by evaluated code
    if (window.Twirlip7) {
        alert("Unexpected: Twirlip7 global already exists!")
        return
    }
    window.Twirlip7 = {
        show: notebookView.show,
        icon: notebookView.icon,
        popup,
        menu,

        notebookView,

        FileUtils,
        CanonicalJSON,
        UUID,
        NotebookUsingLocalStorage,
        NotebookUsingMemory,
        NotebookUsingServer,

        getCurrentNotebook: () => {
            return notebookView.getCurrentNotebook()
        },

        getItemForJSON: getItemForJSON,
        newItem: notebookView.newItem,

        saveItem: async (item) => {
            if (!item.timestamp) item.timestamp = new Date().toISOString()
            if (!item.contributor) item.contributor = notebookView.getCurrentContributor()
            const itemJSON = CanonicalJSON.stringify(item)
            return await notebookView.getCurrentNotebook().addItem(itemJSON)
        },

        findItem(match, configuration) {
            // configuration: { includeMetadata: false, sortBy: "timestamp" (default) | "location" }
            // returns either array of items -- or if includeMetadata is truthy, {location, item, key}
            // TODO: This extremely computationally inefficient placeholder needs to be improved
            // TODO: This should not have to iterate over all stored objects
            if (!configuration) configuration = {}
            const result = []
            const notebook = notebookView.getCurrentNotebook()
            const count = notebook.itemCount()
            for (let i = 0; i < count; i++) {
                const index = i
                const itemJSON = notebook.getItemForLocation(i)
                const item = getItemForJSON(itemJSON)
                if (!item) return
                let isMatch = true
                for (let key in match) {
                    if (item[key] !== match[key]) {
                        isMatch = false
                        continue
                    }
                }
                if (isMatch) {
                    const key = notebook.keyForLocation(index)
                    result.push({ location: index, item, key })
                }
            }
            // Sort so later items are earlier in list
            result.sort((a, b) => {
                if (!configuration.sortBy || configuration.sortBy === "timestamp") {
                    if (a.item.timestamp < b.item.timestamp) return 1
                    if (a.item.timestamp > b.item.timestamp) return -1
                } else if (configuration.sortBy === "location") {
                    if (a.location < b.location) return 1
                    if (a.location > b.location) return -1
                } else {
                    console.log("unexpected sortBy option", configuration.sortBy)
                }
                // compare on triple hash if timestamps match
                const aHash = a.key
                const bHash = b.key
                if (aHash < bHash) return 1
                if (aHash > bHash) return -1
                // Should never get here unless incorrectly storing duplicates
                console.log("duplicate item error", a, b)
                return 0
            })
            if (configuration.includeMetadata) return result
            return result.map(match => match.item)
        }
    }
}

function runStartupItem(itemId) {
    try {
        const item = notebookView.getCurrentNotebook().getItem(itemId)
        if (item) {
            try {
                const code = (item.startsWith("{")) ? JSON.parse(item).value : item
                // TODO: Could this cause issues if eval code is waiting on promises?
                eval(code)
                return "ok"
            } catch (error) {
                console.log("Error running startup item", itemId)
                console.log("Error message\n", error)
                console.log("Beginning of item contents\n", item.substring(0, 500) + (item.length > 500 ? "..." : ""))
                return "failed"
            }
        } else {
            console.log("startup item not found", itemId)
            return "missing"
        }
    } catch (error) {
        console.log("Problem in runStartupItem", error)
        return "error"
    }
}

function runAllStartupItems() {
    const startupInfo = notebookView.getStartupInfo()
    if (startupInfo.startupItemIds.length) {
        setTimeout(() => {
            try {
                const invalidStartupItems = []
                for (let startupItemId of startupInfo.startupItemIds) {
                    const status = runStartupItem(startupItemId)
                    if (status !== "ok") {
                        console.log("Removing " + status + " startup item from bootstrap: ", startupItemId)
                        invalidStartupItems.push(startupItemId)
                    }
                }
                if (invalidStartupItems.length) {
                    // disable any invalid startup items
                    for (let invalidStartupItemId of invalidStartupItems) {
                        const index = startupInfo.startupItemIds.indexOf(invalidStartupItemId)
                        if (index > -1) startupInfo.startupItemIds.splice(index, 1)
                    }
                    notebookView.setStartupInfo(startupInfo)
                }
            } catch (error) {
                console.log("Problem in runAllStartupItems", error)
            }
            m.redraw()
        })
    }
}

function startEditor(preMountCallback, postMountCallback) {
    if (preMountCallback) preMountCallback()
    const root = document.body
    m.mount(root, notebookView)
    setTimeout(() => {
        if (postMountCallback) {
            postMountCallback()
            m.redraw()
        }
        runAllStartupItems()
    }, 0)
}

function hashChange() {
    const hashParams = HashUtils.getHashParams()
    const notebookParam = hashParams["notebook"] || notebookView.getNotebookChoice()
    if (notebookParam !== notebookView.getNotebookChoice()) {
        notebookView.restoreNotebookChoice(notebookParam)
    }

    // do our own routing and ignore things that don't match in case other evaluated code is using Mithril's router
    const itemId = hashParams["item"]
    if (itemId) {
        if (notebookView.getCurrentItemId() !== itemId) {
            notebookView.goToKey(itemId)
        }
    }
    m.redraw()
}

window.addEventListener("hashchange", hashChange, false)

function startup() {
    setupTwirlip7Global()

    notebookView.setCurrentContributor(localStorage.getItem("_contributor") || "")

    const hashParams = HashUtils.getHashParams()
    // "open" should be considered deprecated as too confusing with "item"
    const launchParam = hashParams["launch"] || hashParams["open"]
    const itemParam = hashParams["item"]
    const evalParam = hashParams["eval"]
    const editParam = hashParams["edit"]
    const notebookParam = hashParams["notebook"]

    if (launchParam) {
        notebookView.restoreNotebookChoice(notebookParam)
        launchItem = launchParam
        // Run it now if not for the server or memory (memory can't work)
        if (notebookView.getNotebookChoice() === "local storage") {
            runStartupItem(launchItem)
            launchItem = null
        }
    } else if (!itemParam && evalParam) {
        const startupSelection = evalParam
        const startupFileNames = startupSelection.split("|")
        console.log("startupFileNames", startupFileNames)
        for (let startupFileName of startupFileNames) {
            m.request({ method: "GET", url: startupFileName, deserialize: value => value }).then(function (startupFileContents) {
                eval(startupFileContents)
            })
        }
    } else if (!itemParam && editParam) {
        const startupSelection = editParam
        m.request({ method: "GET", url: startupSelection, deserialize: value => value }).then(function (startupFileContents) {
            startEditor(
                null,
                () => {
                    const currentItem = notebookView.getCurrentItem()
                    currentItem.entity = startupSelection
                    currentItem.attribute = "contents"
                    notebookView.setEditorContents(startupFileContents)
                }
            )
        })
    } else {
        startEditor(
            () => {
                notebookView.restoreNotebookChoice(notebookParam)
                initialKeyToGoTo = itemParam || notebookView.fetchStoredItemId()
            },
            () => {
                // No memory storage at startup and server data loads later, so only do local storage
                if (initialKeyToGoTo && notebookView.getNotebookChoice() === "local storage") {
                    notebookView.goToKey(initialKeyToGoTo)
                }
            }
        )
    }
}

startup()
console.log("called startup")
