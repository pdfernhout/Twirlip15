/* global m, sha256, Twirlip7 */

import { FileUtils } from "../../common/FileUtils.js"
import { HashUtils } from "../../common/HashUtils.js"
import { EvalUtils } from "./EvalUtils.js"
import { Progress } from "../../common/Progress.js"
import { Toast } from "../../common/Toast.js"

import { NotebookExamplesLoader } from "./NotebookExamplesLoader.js"
import { CanonicalJSON } from "../../common/CanonicalJSON.js"

// defines sha256
import "../../vendor/sha256.js"

"use strict"

function newItem() {
    return {
        entity: "",
        attribute: "",
        value: "",
        contentType: "",
        encoding: "",
        contributor: "",
        timestamp: "",
        derivedFrom: "",
        license: ""
    }
}

function icon(iconName, extraClasses) {
    return m("i.fa." + iconName + "[aria-hidden=true]" + (extraClasses ? extraClasses : ""))
}

const twirlip7DataUrlPrefix = "twirlip7://v1/"

// TODO: Fix kludge of passing in NotebookUsingLocalStorage because of startup timing issues
// TODO: Fix kludge of passing in ace and modelist due to import issues
export function NotebookView(NotebookUsingLocalStorage, ace, modelistWrapper) {
    let editor = null

    let lastLoadedItem = newItem()

    let currentItemId = null
    let currentItemIndex = null
    let currentItem = newItem()

    let currentContributor = ""

    let currentNotebook = NotebookUsingLocalStorage
    let notebookChoice = "local storage"

    let isLastEntityMatch = true
    let isLastEntityAttributeMatch = true

    let aceEditorHeight = 20
    let editorMode = "ace/mode/javascript"
    let wasEditorDirty = false

    let focusMode = false
    let collapseWorkspace = false

    // to support user-defined extensions
    const extensions = {}

    // Used for resizing the editor's height
    let dragOriginY = 0

    let startupGoToKey = null

    // Used to indicate that the ace editor is being changed by the application not the user
    let isEditorContentsBeingSetByApplication = false

    function oninit() {
        if (Twirlip7.NotebookUsingLocalStorage.itemCount() === 0) {
            show(function () {
                return [
                    m("div", "You are using Twirlip's programmable notebook and Mithril.js playground. To get started with some example code snippets:"),
                    m("div", "* Make sure \"local storage\" is selected in the dropdown to the right of \"Notebook\"."),
                    m("div", "* Click on the \"Notebook operations\" dropdown at the bottom of the page and select \"Show example notebook\". The text panel should fill up."),
                    m("div", "* Click \"Merge notebook\" (also under \"Notebook operations\"). The item count will change from \"of 0\" to \"of 52\" or such."),
                    m("div", "* To run the first example, click the \"Next\" button to move to the first item, and then click the \"Do it\" button."),
                    m("div", "* Use \"Previous\" and \"Next\" to scroll through more example snippets. \"Inspect it\" puts evaluation results for selected text into the console log.")
                ]
            }, { title: "Startup help" })
        }
    }

    // Reports errors into the view
    function protectedViewFunction(viewFunction, label) {
        return function() {
            let subview
            try {
                subview = viewFunction.call(arguments)
            } catch (e) {
                console.log("Error in show function", e)
                subview = m("div.ba.ma2.pa2.bg-red", (label ? label + ": " : "") + "Error in show function: " + e)
            }
            return subview
        }
    }

    function title(config) {
        if (config.title === undefined || config.title === null) return "Untitled"
        if (typeof config.title === "function") return config.title()
        return config.title
    }

    // Convenience function which examples could use to put up closeable views
    function show(userComponentOrViewFunction, config, componentConfig) {
        try {
            // config supports extraStyling, onclose, and title displayed when collapsed or run stand alone (title can be a string or function)
            if (typeof config === "string") {
                config = { extraStyling: config }
            }
            if (!config) config = {}
            if (!config.extraStyling) { config.extraStyling = "" }
            if (!config.extraStyling.includes(".bg-")) { config.extraStyling += ".bg-light-purple" }

            let div = document.createElement("div")

            const userComponent = userComponentOrViewFunction.view ?
                userComponentOrViewFunction : {
                    view: userComponentOrViewFunction
                }

            userComponent.view = protectedViewFunction(userComponent.view)

            let collapsed = false

            const isCloseButtonHidden = !!HashUtils.getHashParams()["launch"]

            let currentTitle

            if (!isCloseButtonHidden && !config.title && currentItem && (currentItem.entity || currentItem.attribute)) {
                config.title = (currentItem.entity || "<No Entity>") + " :: " + (currentItem.attribute || "<No Attribute>")
            }

            const ClosableComponent = {
                view() {
                    if (collapsed || isCloseButtonHidden) {
                        const newTitle = title(config)
                        if (newTitle !== currentTitle) {
                            currentTitle = newTitle
                            if (isCloseButtonHidden) {
                                document.title = currentTitle
                            }
                        }
                    }
                    return m("div.ba.ma3.pa3.relative" + config.extraStyling,
                        m("div",
                            { style: collapsed ? "display: none" : "display: block" },
                            m(userComponent, componentConfig)
                        ),
                        collapsed ? currentTitle : [],
                        isCloseButtonHidden ? [] : [
                            m("button.absolute", {
                                style: "top: 0.25rem; right: 3.5rem; min-width: 2.0rem; padding: 0",
                                title: collapsed ? "Expand" : "Collapse",
                                onclick: () => collapsed = !collapsed
                            }, (collapsed ? "+" : "-")),
                            m("button.absolute", {
                                style: "top: 0.25rem; right: 1rem; min-width: 2.0rem; padding: 0",
                                title: "Close",
                                onclick: function () {
                                    if (config.onclose) {
                                        try {
                                            config.onclose()
                                        } catch (e) {
                                            console.log("Error in onclose function", e)
                                        }
                                    }
                                    m.mount(div, null)
                                    document.body.removeChild(div)
                                }
                            }, "X")
                        ]
                    )
                }
            }

            document.body.appendChild(div)
            m.mount(div, ClosableComponent)
        } catch (error) {
            console.error("show", error)
        }
    }

    function saveCurrentItemId() {
        const hashParams = HashUtils.getHashParams()
        const itemIdToSave = currentItemId || ""
        localStorage.setItem("_current_" + notebookChoice, itemIdToSave)
        hashParams["item"] = itemIdToSave
        HashUtils.setHashParams(hashParams)
    }

    function fetchStoredItemId() {
        const storedItemId = localStorage.getItem("_current_" + notebookChoice)
        return storedItemId
    }

    function restoreCurrentItemId() {
        let storedItemId = fetchStoredItemId()
        // Memory is transient on reload, so don't try to go to missing keys to avoid a warning
        if (notebookChoice === "memory") {
            const item = currentNotebook.getItem(storedItemId)
            if (item === null) storedItemId = null
        }
        goToKey(storedItemId, {ignoreDirty: true})
    }

    function saveNotebookChoice() {
        const hashParams = HashUtils.getHashParams()
        localStorage.setItem("_currentNotebookChoice", notebookChoice)
        hashParams["notebook"] = notebookChoice
        HashUtils.setHashParams(hashParams)
    }

    function restoreNotebookChoice(notebookParam) {
        const newChoice = notebookParam || localStorage.getItem("_currentNotebookChoice") || "local storage"
        if (newChoice && newChoice !== notebookChoice) {
            const newNotebook = notebooksAvailable()[newChoice]
            if (newNotebook) {
                notebookChoice = newChoice
                currentNotebook = newNotebook
            } else{
                alert("Notebook not available for: " + newChoice)
            }
        }
    }

    function notebooksAvailable() {
        const notebooks = {
            "local storage": Twirlip7.NotebookUsingLocalStorage,
            "memory": Twirlip7.NotebookUsingMemory,
            "server": Twirlip7.NotebookUsingServer.isAvailable() ? Twirlip7.NotebookUsingServer : null
        }
        return notebooks
    }

    function changeNotebook(newChoice) {
        const oldChoice = notebookChoice
        if (newChoice === oldChoice) return

        const newNotebook = notebooksAvailable()[newChoice]
        if (!newNotebook) {
            alert("Notebook not available for: " + newChoice)
            return
        }

        if (!confirmClear()) return

        saveCurrentItemId()
        notebookChoice = newChoice
        currentNotebook = newNotebook
        restoreCurrentItemId()
        saveNotebookChoice()
    }

    function setEditorContents(newContents, keepUndo) {
        isEditorContentsBeingSetByApplication = true
        if (typeof newContents !== "string") {
            console.error("setEditorContents: newContents should be a string", newContents)
            newContents = ""
        }
        try {
            editor.setValue(newContents)
        } catch(e) {
            console.log("setEditorContents: error for newContents", newContents)
            console.log(e)
        }
        isEditorContentsBeingSetByApplication = false
        editor.selection.clearSelection()
        editor.selection.moveCursorFileStart()
        editor.getSession().setScrollTop(0)
        // Replace undoManager since getUndoManager().reset() does not see to work well enough here
        if (!keepUndo) editor.getSession().setUndoManager(new ace.UndoManager())
    }

    function getEditorContents() {
        return editor.getValue()
    }

    function getSelectedEditorText() {
        let selectedText = editor.session.getTextRange(editor.getSelectionRange())
        let isNoSelection = false
        if (!selectedText) {
            // assume user wants all text if nothing is selected
            selectedText = editor.getValue()
            isNoSelection = true
        }
        return {
            text: selectedText,
            isNoSelection,
        }
    }

    function prepareCurrentItemForSaving(value) {
        // TODO: reference previous if relevant and also set timestamps and author as needed
        currentItem.value = value
        currentItem.timestamp = new Date().toISOString()
        currentItem.contributor = currentContributor
        currentItem.derivedFrom = currentItemId || ""
        // TODO: Maybe check to be sure there is a license?
        return CanonicalJSON.stringify(currentItem)
    }

    async function save() {
        if (!isEditorDirty()) {
            if (!confirm("There are no changes.\nSave a new item anyway with a later timestamp?")) return false
        }
        if (!currentContributor) {
            if (!promptForContributor()) return false
        }
        const newContents = getEditorContents()
        const itemJSON = prepareCurrentItemForSaving(newContents)
        const addResult = await currentNotebook.addItem(itemJSON)
        if (addResult.error) {
            alert("save failed -- maybe too many localStorage items?\n" + addResult.error)
            return false
        }
        if (addResult.existed) {
            Toast.toast("Item already saved", 1000)
        } else {
            Toast.toast("Saved item as:\n" + addResult.id, 2000)
        }
        updateLastLoadedItemFromCurrentItem()
        wasEditorDirty = false
        currentItemId = addResult.id
        currentItemIndex = addResult.location
        saveCurrentItemId()
        updateIsLastMatch(true)
        setDocumentTitleForCurrentItem()
        return true
    }

    function interceptSaveKey(evt) {
        // derived from: https://stackoverflow.com/questions/2903991/how-to-detect-ctrlv-ctrlc-using-javascript
        evt = evt || window.event // IE support
        var c = evt.keyCode
        var ctrlDown = evt.ctrlKey || evt.metaKey // Mac support

        // Check for Alt+Gr (http://en.wikipedia.org/wiki/AltGr_key)
        if (ctrlDown && evt.altKey) return true

        // Check for ctrl+s
        if (ctrlDown && c == 83) {
            save()
            return false
        }

        // Otherwise allow
        return true
    }

    function isEditorDirty() {
        // TODO: compare individual strings instead of use CanonicalJSON.stringify to be more efficient
        const result = editor && (CanonicalJSON.stringify(lastLoadedItem) !== CanonicalJSON.stringify(currentItem))
        return result
    }

    function confirmClear(promptText) {
        if (!getEditorContents()) return true
        if (!isEditorDirty()) return true
        if (!promptText) promptText = "You have unsaved editor changes. Proceed?"
        return confirm(promptText)
    }

    function clear() {
        if (!confirmClear()) return
        // Preserve some fields if it has a value -- so can push twice to totally clear
        const oldItem = currentItem
        currentItemId = null
        currentItemIndex = null
        currentItem = newItem()
        if (oldItem.value) {
            currentItem.entity = oldItem.entity
            currentItem.attribute = oldItem.attribute
            currentItem.contentType = oldItem.contentType
            currentItem.encoding = oldItem.encoding
            currentItem.license = oldItem.license
        }
        wasEditorDirty = false
        saveCurrentItemId()
        updateIsLastMatch()
        setEditorContents(currentItem.value)
        setDocumentTitleForCurrentItem()
    }

    function doIt() {
        const selection = getSelectedEditorText()
        try {
            EvalUtils.eval(selection.text)
        } catch (error) {
            Toast.toast("Eval error:\n" + error)
        }
    }

    function replaceSelection(textToInsert) {
        const selection = getSelectedEditorText()

        // Assume want to replace everything if no selection
        if (selection.isNoSelection) { editor.selection.selectAll() }

        const selectedRange = editor.selection.getRange()
        const start = selectedRange.start
        const end = editor.session.replace(selectedRange, textToInsert)
        editor.selection.setRange({start, end})

        editor.focus()
    }


    function insertText(textToInsert) {
        const selection = getSelectedEditorText()

        if (selection.isNoSelection) { editor.selection.moveCursorFileEnd() }

        const selectedRange = editor.selection.getRange()
        const start = selectedRange.end
        const end = editor.session.insert(start, textToInsert)
        editor.selection.setRange({start, end})

        editor.focus()
    }

    function printIt() {
        const selection = getSelectedEditorText()
        const evalResult = EvalUtils.evalOrError(selection.text)
        const textToInsert = " " + evalResult

        insertText(textToInsert)
    }

    function inspectIt() {
        const selection = getSelectedEditorText()
        const evalResult = EvalUtils.evalOrError(selection.text)
        console.dir(evalResult)
    }

    function launchIt() {
        if (currentNotebook === Twirlip7.NotebookUsingMemory) {
            alert("Items in a memory notebook can't be launched in a new window.")
            return
        }
        if (currentItemId === null) {
            alert("To launch an item in its own window, you need to\nnavigate to an item first or save a new one.")
            return
        }
        window.open("#notebook=" + notebookChoice + "&launch=" + currentItemId)
    }

    function importText(convertToBase64) {
        if (!confirmClear()) return
        FileUtils.loadFromFile(convertToBase64, (fileName, fileContents) => {
            if (fileContents) {
                const newContent = fileContents
                // We don't know if the text is changed, so use null for wasEditorDirty
                wasEditorDirty = null
                currentItem.encoding = convertToBase64 ? "base64" : ""
                setEditorContents(newContent, "keepUndo")
                m.redraw()
            }
        })
    }

    function importTextPlain() {
        importText(false)
    }

    function importTextAsBase64() {
        importText(true)
    }

    function exportText() {
        const fileContents = getEditorContents()
        const provisionalFileName = fileContents.split("\n")[0]
        FileUtils.saveToFile(provisionalFileName, fileContents)
    }

    function makeDataURLForItemId(itemId) {
        const itemText = currentNotebook.getItem(itemId)
        const encodedText = encodeURIComponent(itemText)
        const dataURL = twirlip7DataUrlPrefix + itemId + "/" + itemText.length + "/" + encodedText.length + "/" + encodedText
        const result = { itemId, itemText, dataURL }
        return result
    }

    function displayDataURLForCurrentNote() {
        if (currentItemId) {
            if (!confirmClear()) return
            try {
                const dataURLConversionResult = makeDataURLForItemId(currentItemId)
                const dataURL = dataURLConversionResult.dataURL
                showText(dataURL, "text/plain")
                editor.selection.selectAll()
                editor.focus()
                m.redraw()
            } catch(error) {
                console.log("Problem in displayDataURLForCurrentNote", error)
            }
        } else {
            alert("Please select a saved item first")
        }
    }

    // Recursive function
    function followDerivedFrom(dataURLs, itemId) {
        if (itemId) {
            const dataURLConversionResult = makeDataURLForItemId(itemId)
            dataURLs.unshift(dataURLConversionResult.dataURL)
            const item = Twirlip7.getItemForJSON(dataURLConversionResult.itemText)
            return followDerivedFrom(dataURLs, item.derivedFrom)
        } else {
            return null
        }
    }

    function displayDataURLForCurrentNoteAndHistory() {
        if (currentItemId) {
            if (!confirmClear()) return
            let dataURLs = []

            try {
                followDerivedFrom(dataURLs, currentItemId)
                const textForAllItems = dataURLs.join("\n")
                showText(textForAllItems, "text/plain")
                editor.selection.selectAll()
                editor.focus()
                m.redraw()
            } catch(error) {
                console.log("Problem in displayDataURLForCurrentNoteAndHistory", error)
            }
        } else {
            alert("Please select a saved item first")
        }
    }

    async function makeNoteForDataURL(dataURL) {
        if (dataURL) {
            if (!dataURL.startsWith(twirlip7DataUrlPrefix)) {
                alert("Twirlip7 data URL should start with: " + twirlip7DataUrlPrefix)
                return null
            }

            const subparts = dataURL.substring(twirlip7DataUrlPrefix.length).split("/")
            if (subparts.length != 4) {
                alert("Twirlip7 data URL should have exactly four subparts: key/itemLength/contentsLength/contents")
                return null
            }

            const key = subparts[0]
            const itemLength = parseInt(subparts[1])
            const contentsLength = parseInt(subparts[2])
            const encodedText = subparts[3]

            if (encodedText.length !== contentsLength) {
                alert("Twirlip7 data URL contents length of " + encodedText.length + " does not match expected length of " + contentsLength)
                return null
            }

            const itemText = decodeURIComponent(encodedText)
            if (itemText.length !== itemLength) {
                alert("Twirlip7 data URL decoded item length of " + itemText.length + " does not match expected length of " + itemLength)
                return null
            }

            const itemSHA256 = "" + sha256(itemText)
            if (itemSHA256 !== key) {
                alert("Twirlip7 data URL decoded item sha256 of " + itemSHA256 + " does not match expected sha256 of " + key)
                return null
            }

            // TODO: Consolidate the copy/paste adding of item with where this is copied from
            try {
                const addResult = await currentNotebook.addItem(itemText)
                if (addResult.error) {
                    alert("save failed -- maybe too many localStorage items?\n" + addResult.error)
                    return null
                }
                return key
            } catch(error) {
                console.log("Problem in makeNoteForDataURL", error)
                return null
            }
        } else {
            alert("Please enter a Twirlip 7 data url starting with " + twirlip7DataUrlPrefix)
            return null
        }
    }

    // Also does a redraw when needed
    async function readNotesFromDataURLs() {
        const textForAllItems = getSelectedEditorText().text.trim()
        const dataURLs = textForAllItems.split("\n")
        const keys = []

        const dataURLStack = dataURLs.slice()

        // Recursive function
        async function recursivelyMakeNotes() {
            if (!dataURLStack.length) return true
            const dataURL = dataURLStack.shift()
            const key = await makeNoteForDataURL(dataURL)
            if (key) {
                keys.push(key)
                return await recursivelyMakeNotes()
            } else {
                return false
            }
        }

        try {
            await recursivelyMakeNotes()
            if (keys.length && keys.length === dataURLs.length) {
                goToKey(keys[keys.length - 1], {ignoreDirty: true})
            }
        } catch(error) {
            console.log("Problem in readNotesFromDataURLs", error)
        }
    }

    function skip(delta, wrap) {
        if (!currentNotebook.itemCount()) {
            Toast.toast("No items to display. Try saving one first -- or show the example notebook in the editor and then load it.")
            return
        }
        try {
            const newIndex = currentNotebook.skip(currentItemIndex, delta, wrap)
            const key = currentNotebook.keyForLocation(newIndex)
            goToKey(key)
        } catch(error) {
            console.log("Error when skipping", error)
        }
    }

    function goToKey(key, options) {
        if (!editor) {
            console.log("EARLY GOTOKEY")
            // Called before we are ready -- defer this for later
            startupGoToKey = {key, options}
            return false
        }
        if (!options) options = {}

        // First check is to prevent losing redo stack and cursor position if not moving
        if (!options.reload && key === currentItemId && !isEditorDirty()) {
            updateIsLastMatch()
            if (!options.noredraw) m.redraw()
            return false
        }
        if (!options.ignoreDirty && !confirmClear()) {
            updateIsLastMatch()
            if (!options.noredraw) m.redraw()
            return false
        }

        const progressDelay = 200
        let progressTimeout

        // default to showing progress
        if (options.showProgress === undefined) options.showProgress = true

        if (options.showProgress) {
            progressTimeout = setTimeout(() => {
                progressTimeout = null
                Progress.progress("Loading " + key + " ...")
                m.redraw()
            }, progressDelay)
        }

        try {
            const itemText = currentNotebook.getItem(key)
            let item
            if (itemText === undefined || itemText === null) {
                if (key) Toast.toast("item not found for:\n\"" + key + "\"")
                item = newItem()
                key = null
            } else if (itemText[0] !== "{") {
                // TODO: remove legacy development support
                item = newItem()
                item.value = itemText
            } else {
                item = JSON.parse(itemText)
            }
            currentItemId = key
            // TODO: Optimize setting currentItemIndex here from item info once that is changed
            currentItem = item

            wasEditorDirty = false
            updateLastLoadedItemFromCurrentItem()

            setEditorModeForContentType(item.contentType)

            saveCurrentItemId()
            updateIsLastMatch()
            setEditorContents(item.value || "")
            setDocumentTitleForCurrentItem()

            // TODO: Optimize this so the index is returned with item data
            const itemIndex = currentNotebook.locationForKey(currentItemId)
            currentItemIndex = itemIndex
            if (options.showProgress) {
                if (progressTimeout) {
                    // Did not show progress message yet, so don't show it now
                    clearTimeout(progressTimeout)
                } else {
                    Progress.progress(null)
                }
            }
            // Redraw as a convenience by default to avoid a dozen callers doing it
            if (!options.noredraw) m.redraw()
            return true
        } catch(error) {
            console.log("Error in goToKey", error)
            m.redraw()
            return false
        }
    }

    function setDocumentTitleForCurrentItem() {
        let newTitle
        if (!currentItem.entity && !currentItem.attribute) {
            newTitle = "Twirlip7 Programmable Notebook"
        } else {
            newTitle = currentItem.entity + " :: " + currentItem.attribute
        }
        document.title = newTitle
    }

    // TODO: Improve ad hoc partial handling of character types which also ignores character set

    function setEditorModeForContentType(contentType) {
        let newMode = "javascript"
        if (contentType) {
            // try to change editor mode to match content type
            contentType = contentType.trim().toLowerCase()
            if (contentType === "application/javascript") {
                newMode = "javascript"
            } else if (contentType === "application/json") {
                newMode = "json"
            } else if (contentType.startsWith("text/markdown")) {
                newMode = "markdown"
            } else if (contentType.startsWith("text/html")) {
                newMode = "html"
            } else if (contentType.startsWith("text/xml")) {
                newMode = "xml"
            } else if (contentType.startsWith("image/svg+xml")) {
                newMode = "svg"
            } else if (contentType.startsWith("text/plain")) {
                newMode = "text"
            } else if (contentType.startsWith("text/x-")) {
                // TODO: Improve this to deal with character encoding or other parameters after a semicolon
                newMode = contentType.substring("text/x-".length)
            } else if (contentType.startsWith("image/")) {
                newMode = "text"
            }
        }

        newMode = "ace/mode/" + newMode

        editorMode = newMode
        editor.getSession().setMode(newMode)
    }

    function guessContentTypeForEditorMode(editorMode) {
        const modeName = editorMode.substring("ace/mode/".length)
        if (modeName === "javascript") return "application/javascript"
        if (modeName == "json") return "application/json"
        if (modeName === "html") return "text/html"
        if (modeName === "markdown") return "text/markdown; charset=utf-8"
        if (modeName == "xml") return "text/xml"
        if (modeName == "svg") return "image/svg+xml"
        if (modeName == "text") return "text/plain; charset=utf-8"
        return "text/x-" + modeName
    }

    function goFirst() { skip(-1000000) }

    function goPrevious() { skip(-1) }

    function goNext() { skip(1) }

    function goLast() { skip(1000000) }

    function goToLatestForEntity() {
        try {
            const key = findLatestForEntity()
            if (key) {
                return goToKey(key)
            }
            return false
        } catch(error) {
            console.log("Problem in goToLatestForEntity", error)
            return false
        }
    }

    function goToLatestForEntityAttribute() {
        try {
            const key = findLatestForEntityAttribute()
            if (key) {
                return goToKey(key)
            }
            return false
        } catch(error) {
            console.log("Problem in goToLatestForEntityAttribute", error)
            return false
        }
    }

    function findLatestForEntity() {
        try {
            const matches = Twirlip7.findItem({entity: currentItem.entity}, { includeMetadata: true, sortBy: "location" })
            if (matches.length) {
                return matches[0].key
            }
            return null
        } catch(error) {
            console.log("Problem in findLatestForEntity", error)
            return null
        }
    }

    function findLatestForEntityAttribute() {
        try {
            const matches = Twirlip7.findItem({
                entity: currentItem.entity,
                attribute: currentItem.attribute
            }, { includeMetadata: true, sortBy: "location" })
            if (matches.length) {
                return matches[0].key
            }
            return null
        } catch(error) {
            console.log("Problem in findLatestForEntityAttribute", error)
            return null
        }
    }

    // TODO: does this still have spurious redraw?
    function updateIsLastMatch(value) {
        // TODO: Computing these two variables is CPU intensive as they both iterate over all items
        if (value !== undefined) {
            isLastEntityMatch = value
            isLastEntityAttributeMatch = value
            m.redraw()
            return false
        }
        try {
            const latestForEntity = findLatestForEntity()
            const latestForEntityAttribute = findLatestForEntityAttribute()
            if (isEditorDirty() || !currentItemId) {
                isLastEntityMatch = !latestForEntity
                isLastEntityAttributeMatch = !latestForEntityAttribute
            } else {
                isLastEntityMatch = latestForEntity === currentItemId
                isLastEntityAttributeMatch = latestForEntityAttribute === currentItemId
            }
            // TODO: Redraw for convenience of callers -- probably makes a spurious redraw a lot of times
            // TODO: Replace this with optimization of info about item when it is retrieved or other new items are added
            m.redraw()
            return true
        } catch(error) {
            console.log("Problem in updateIsLastMatch", error)
            return false
        }
    }

    function updateLastLoadedItemFromCurrentItem() {
        lastLoadedItem = JSON.parse(JSON.stringify(currentItem))
    }

    function showText(newText, contentType) {
        // currentItemId = null
        // currentItemIndex = null
        currentItem = newItem()
        currentItem.value = newText
        currentItem.contentType = contentType

        wasEditorDirty = false
        updateLastLoadedItemFromCurrentItem()

        setEditorModeForContentType(currentItem.contentType)
        // saveCurrentItemId()
        updateIsLastMatch(true)
        setEditorContents(newText)
    }

    function showNotebook(notebookText) {
        showText(notebookText, "application/json")
    }

    function showCurrentNotebook() {
        if (!confirmClear()) return
        try {
            const textForNotebook = currentNotebook.textForNotebook()
            showNotebook(textForNotebook)
        } catch(error) {
            console.log("Problem in showCurrentNotebook", error)
        }
    }

    function showExampleNotebook() {
        if (!confirmClear()) return
        Progress.progress("Loading examples; please wait...")
        NotebookExamplesLoader.loadAllFiles(
            (progressMessage) => {
                Progress.progress(progressMessage)
                m.redraw()
            },
            (exampleNotebook) => {
                showNotebook(JSON.stringify(exampleNotebook, null, 4))
                Progress.progress(null)
                m.redraw()
            }
        )
    }

    function replaceNotebook() {
        if (currentNotebook.itemCount() && !confirm("Replace all items in the " + notebookChoice + " notebook with items from JSON in editor?")) return false
        try {
            currentNotebook.loadFromNotebookText(getEditorContents())
            // Update lastLoadedItem.value in case pasted in contents to avoid warning later since data was processed as intended
            lastLoadedItem.value = getEditorContents()
            wasEditorDirty = false
            Toast.toast("Replaced notebook from editor")
            m.redraw()
            return true
        } catch(error) {
            Toast.toast("Problem replacing notebook from editor:\n" + error)
            m.redraw()
            return false
        }
    }

    async function mergeNotebook() {
        if (currentNotebook.itemCount() && !confirm("Merge items from JSON in editor into the current notebook?")) return
        try {
            // TODO: Had empty Promise -- was it needed?
            let addedItemCount = 0
            const newNotebookItems = JSON.parse(getEditorContents())
            for (let itemJSON of newNotebookItems) {
                const addResult = await currentNotebook.addItem(itemJSON)
                if (!addResult.existed) addedItemCount++
            }
            Toast.toast("Added " + addedItemCount + " item" + ((addedItemCount === 1 ? "" : "s")) + " to current notebook")
            // Update lastLoadedItem.value in case pasted in contents to avoid warning later since data was processed as intended
            lastLoadedItem.value = getEditorContents()
            wasEditorDirty = false
            m.redraw()
        } catch(error) {
            console.log("Problem while merging", error)
            Toast.toast("Problem merging notebook from editor:\n" + error)
            m.redraw()
        }
    }

    // Extension sections are intended to be user-defined
    // extension example: {id: "hello", tags: "header", code: (context) => m("div", "Hello from extension") }

    // This finds all extensions with the tag, runs the code for each, and returns an array of the results
    function extensionsCallForTag(tag, phase) {
        const result = []
        const sortedKeys = Object.keys(extensions).sort()
        for (let key of sortedKeys) {
            const extension = extensions[key]
            if (!extension) continue
            if (extension.tags && (tag === extension.tags || extension.tags[tag])) {
                if (extension.code) {
                    const callResult = protectedViewFunction(extension.code, "Extension " + extension.id)({tag, phase, extension})
                    result.push(callResult)
                } else {
                    console.log("no code for extension", extension.id)
                }
            }
        }
        return result
    }

    function extensionsInstall(extension) {
        if (!extension.id) {
            console.log("no id for extension to install\n" + JSON.stringify(extension))
            return
        }
        extensions[extension.id] = extension
    }

    function extensionsUninstall(extension) {
        if (!extension.id) {
            console.log("no id for extension to uninstall\n" + JSON.stringify(extension))
            return
        }
        delete extensions[extension.id]
    }

    function getStartupInfo() {
        // format: { startupItemIds: [ids...] }
        const startupInfo = localStorage.getItem("_startup")
        if (startupInfo) {
            try {
                const startupInfoParsed = JSON.parse(startupInfo)
                if (startupInfoParsed.startupItemIds) {
                    return startupInfoParsed
                }
            } catch (error) {
                console.log("Problem parsing startup info", error)
                console.log("Startup info was", startupInfo)
                setStartupInfo(null)
            }
        }
        return { startupItemIds: [] }
    }

    function setStartupInfo(info) {
        localStorage.setItem("_startup", JSON.stringify(info))
    }

    function promptForContributor() {
        const contributor = prompt("Contributor? e.g. Jane Smith <jane.smith@example.com>", currentContributor)
        if (contributor !== null) {
            currentContributor = contributor
            localStorage.setItem("_contributor", contributor)
            return true
        }
        return false
    }

    // View functions which are composed into one big view at the end

    function viewFocusAndCollapse() {
        return m("div.fr", [
            viewDirty(),
            m("span.mr2"),
            m("span.mr2", {  title: "focus mode hides extraneous editor controls to provide more space for testing" },
                m("input[type=checkbox].ma1", {
                    checked: focusMode,
                    onchange: (event) => focusMode = event.target.checked
                }),
                "hide details"
            ),
            m("button.fr", { style: "min-width: 1.5rem", onclick: () => collapseWorkspace = true, title: "click here to hide the editor" }, "-"),
        ])
    }

    function viewAbout() {
        return m("div#about.bg-lightest-blue.pa1.mb1", { style: "padding-bottom: 0.5rem" }, [
            m("a.ml2", { target: "_blank", href: "https://github.com/pdfernhout/Twirlip7" }, "Twirlip7"),
            m("div.ea-header", { style: "display: " + (focusMode ? "inline" : "none") }, [
                m("span.ml3", { title: "Entity" }, currentItem.entity || m("span.i", "<No Entity>")),
                m("span.ml2", "::"),
                m("span.ml2", { title: "Attribute" }, currentItem.attribute || m("span.i", "<No Attribute>"))
            ]),
            m("div.help-header", { style: "display: " + (!focusMode ? "inline" : "none") }, [
                m("span.ml1.f7", "uses"),
                m("a.ml1.f7", { target: "_blank", href: "https://mithril.js.org/" }, "Mithril"),
                m("a.f7", { target: "_blank", href: "https://github.com/MithrilJS/mithril.js" }, ".js"),
                m("a.ml2.f7", { target: "_blank", href: "http://tachyons.io/" }, "Tachyons"),
                m("a.f7", { target: "_blank", href: "https://github.com/tachyons-css/tachyons/blob/master/css/tachyons.css" }, ".css"),
                m("a.ml2.f7", { target: "_blank", href: "http://fontawesome.io/icons/" }, "Font Awesome"),
                m("a.ml2.f7", { target: "_blank", href: "https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts" }, "Ace"),
                m("a.ml2.f7", { target: "_blank", href: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" }, "JavaScript"),
                m("span.ml2.f7", "|"),
                m("a.ml2.f7", { target: "_blank", href: "https://arthurclemens.github.io/mithril-template-converter" }, "HTML->Mithril")
            ]),
            viewFocusAndCollapse(),
        ])
    }

    function viewNavigate() {
        const itemCount = currentNotebook.itemCount()
        const itemIndex = currentItemIndex

        const notebooks = notebooksAvailable()

        function notebookChanged(event) {
            if (!confirmClear()) {
                return
            }
            changeNotebook(event.target.value)
        }

        function isPreviousDisabled() {
            if (itemCount === 0) return true
            // Allow null item index to go to first or last
            if (itemIndex === null) return false
            if (itemIndex === 0) return true
            return false
        }

        function isNextDisabled() {
            if (itemCount === 0) return true
            // Allow null item index to go to first or last
            if (itemIndex === null) return false
            if (itemIndex >= itemCount - 1) return true
            return false
        }

        function itemIdentifierClicked() {
            const newItemId = prompt("Go to item id", currentItemId)
            if (!newItemId) return
            // TODO: Should have a check for "exists"
            try {
                const item = currentNotebook.getItem(newItemId)
                if (item === null) {
                    alert("Could not find item for id:\n" + newItemId)
                } else {
                    goToKey(newItemId, {reload: true})
                }
            } catch(error) {
                console.log("Error in itemIdentifierClicked", error)
            }
        }

        function itemPositionClicked() {
            const newItemIndex = prompt("Go to item index", itemIndex === null ? "" : itemIndex + 1)
            if (!newItemIndex || newItemIndex === itemIndex) return
            // TODO: Should have a check for "exists" at location
            let newItemId = null
            try {
                const itemId = currentNotebook.keyForLocation(parseInt(newItemIndex) - 1)
                newItemId = itemId
                const item = currentNotebook.getItem(newItemId)
                if (item === null) {
                    alert("Could not find item for index:\n" + newItemIndex)
                } else {
                    goToKey(newItemId, {reload: true})
                }
            } catch(error) {
                console.log("Error in itemPositionClicked", error)
            }
        }

        const itemIdentifier = (currentItemId === null)
            ? "???"
            : ("" + currentItemId).substring(0, 12) + ((("" + currentItemId).length > 12) ? "..." : "")

        return m("div.ba.ma1",
            m("span.ml1", "Notebook"),
            m("select.ma2", {
                onchange: notebookChanged,
                title: "Change storage location of items",
                // The value is required here in addition to setting the options: https://gitter.im/mithriljs/mithril.js?at=59492498cf9c13503ca57fdd
                value: notebookChoice
            }, Object.keys(notebooks).sort().map((notebookKey) => {
                let name = notebookKey
                if (notebookKey === "server" && notebooks[notebookKey] && !Twirlip7.NotebookUsingServer.isLoaded()) {
                    name += " <-->"
                }
                return m("option", { value: notebookKey, disabled: !notebooks[notebookKey]}, name)
            })),
            m("button.ma1", { onclick: goFirst, title: "Go to first item", disabled: isPreviousDisabled() }, icon("fa-fast-backward.mr1"), "First"),
            m("button.ma1", { onclick: goPrevious, title: "Go to earlier item", disabled: isPreviousDisabled() }, icon("fa-step-backward.mr1"), "Previous"),
            m("button.ma1", { onclick: goNext, title: "Go to later item", disabled: isNextDisabled() }, "Next", icon("fa-step-forward.ml1")),
            m("button.ma1", { onclick: goLast, title: "Go to last item", disabled: isNextDisabled() }, "Last", icon("fa-fast-forward.ml1")),
            m("div.dib.ml1", { onclick: itemPositionClicked, title: "Click to jump to different item by index" },
                "Item: " +(itemIndex === null ? "???" : (itemIndex + 1)) + " of " + itemCount
            ),
            m("span.ml2", { title: "Click to jump to different item by identifier", onclick: itemIdentifierClicked }, "Id: " + itemIdentifier),
        )
    }

    function viewEditorMode() {
        function selectChanged(event) {
            const newEditorMode = event.target.value
            editorMode = newEditorMode
            editor.getSession().setMode(editorMode)
            currentItem.contentType = guessContentTypeForEditorMode(newEditorMode)
        }
        return m("select", { value: editorMode, onchange: selectChanged },
            modelistWrapper.modelist 
                ? modelistWrapper.modelist.modes.map(mode => m("option", { value: mode.mode }, mode.name))
                : []
        )
    }

    function viewDirty() {
        return m("span.dirty",
            isEditorDirty() ?
                "Modified" :
                ""
        )
    }

    function viewContext() {
        const undoManager = editor && editor.getSession().getUndoManager()
        return [
            m("div.ma1",
                m("span.dib.w4.tr.mr1", {
                    title: "Entity: the object, event, idea, instance, examplar, element, record, activity, row, dependent variable, group, topic, category, or document" +
                    " being described or defined. Entities can also recursively include parts or sections of larger entities when they are thought of as individual things with their own specific details."
                }, "Entity", icon("fa-snowflake-o.ml1")),
                m("input.w-60", {
                    value: currentItem.entity || "",
                    oninput: event => {
                        currentItem.entity = event.target.value
                        updateIsLastMatch()
                    },
                    onkeydown: interceptSaveKey
                }),
                m("button.ml1", {
                    onclick: goToLatestForEntity,
                    title: "Latest item for Entity",
                    disabled: isLastEntityMatch
                }, " E", icon("fa-fast-forward.ml1"))
            ),
            m("div.ma1",
                m("span.dib.w4.tr.mr1", {
                    title: "Attribute: the property, feature, parameter, detail, dimension, field, aspect, characteristic, predicate, outcome, header, column," +
                    " independent variable, subtopic, subcategory, subpart, or subsection of the entity being described or defined"
                }, "Attribute", icon("fa-pie-chart.ml1")), // fa-arrow-circle-o-down fa-pie-chart fa-puzzle-piece
                m("input.w-60", {
                    value: currentItem.attribute || "",
                    oninput: event => {
                        currentItem.attribute = event.target.value
                        updateIsLastMatch()
                    },
                    onkeydown: interceptSaveKey
                }),
                m("button.ml1", {
                    onclick: goToLatestForEntityAttribute,
                    title: "Latest item for Entity-Attribute pair",
                    disabled: isLastEntityAttributeMatch
                }, " EA", icon("fa-fast-forward.ml1"))
            ),
            m("div.ma1",
                m("div.mb1",
                    m("span.dib.w4.tr.mr1", {
                        title: "Value: a note, observation, description, definition, or specification about the state of the entity's attribute at some point in time"
                    }, "Value", icon("fa-file-text-o.ml1")),
                    viewEditorMode(),
                    undoManager ? [
                        m("button.ml2", {onclick: () => undoManager.undo(), disabled: !undoManager.hasUndo() }, icon("fa-undo.mr1"), "Undo"),
                        m("button.ml1.mr2", {onclick: () => undoManager.redo(), disabled: !undoManager.hasRedo() }, "Redo", icon("fa-repeat.ml1")),
                    ] : [],
                    focusMode ? [] : viewSaveButton(),
                    m("button", { onclick: clear, title: "Clear out text in editor and the derivedFrom link\nPress a second time to clear other fields too" }, icon("fa-file-o.mr1"), "New item")
                )
            )
        ]
    }

    function viewAuthor() {
        return [
            m("div.ma1",
                m("span.dib.w4.tr.mr2", "Content type", icon("fa-code.ml1")),
                m("input.w-40", {
                    value: currentItem.contentType || "",
                    oninput: event => currentItem.contentType = event.target.value,
                    onkeydown: interceptSaveKey
                }),
                m("span.pa2"),
                m("span.dib.w4.tr.mr2", {title: "content transfer encoding like \"base64\" for binary data"}, "Encoding", icon("fa-envelope-open-o.ml1")),
                m("input.w-20", {
                    value: currentItem.encoding || "",
                    oninput: event => currentItem.encoding = event.target.value,
                    onkeydown: interceptSaveKey
                })
            ),
            m("div.ma1",
                m("span.dib.w4.tr.mr2", viewContributor()),
                m("input.w-40.bg-light-gray", {
                    readonly: true,
                    value: currentItem.contributor || "",
                    oninput: event => currentItem.contributor = event.target.value,
                    onkeydown: interceptSaveKey
                }),
                m("span.pa2"),
                m("span.dib.w4.tr.mr2", "Timestamp", icon("fa-clock-o.ml1")),
                m("input.w-20.bg-light-gray", {
                    readonly: true,
                    value: currentItem.timestamp || "",
                    oninput: event => currentItem.timestamp = event.target.value,
                    onkeydown: interceptSaveKey
                })
            ),
            m("div.ma1",
                m("span.dib.w4.tr.mr2", {
                    title: "click to go to item",
                    onclick: () => { if (currentItem.derivedFrom) goToKey(currentItem.derivedFrom) },
                }, "Derived from", icon("fa-arrow-circle-o-left.ml1")),
                m("input.w-40.bg-light-gray", {
                    readonly: true,
                    value: currentItem.derivedFrom || "",
                    oninput: event => currentItem.derivedFrom = event.target.value,
                    onkeydown: interceptSaveKey
                }),
                m("span.pa2"),
                m("span.dib.w4.tr.mr2", "License", icon("fa-id-card-o.ml1")),
                m("input.w-20", {
                    value: currentItem.license || "",
                    oninput: event => currentItem.license = event.target.value,
                    onkeydown: interceptSaveKey
                })
            )
        ]
    }

    function viewContributor() {
        return m("span", {
            onclick: promptForContributor,
            title: "Click to set current contributor for next contribution" + (currentContributor ? "\n" + currentContributor : ""),
        }, "Contributor", icon("fa-user.ml1"))
    }

    function viewEditor() {
        return m("div.w-100#editor", {
            style: {
                height: aceEditorHeight + "rem"
            },
            oncreate: function() {
                editor = ace.edit("editor")

                // Suppress warning about deprecated feature
                editor.$blockScrolling = Infinity

                const session = editor.getSession()
                session.setMode(editorMode)
                session.setUseSoftTabs(true)

                // wrapping
                session.setUseWrapMode(true)
                session.setOption("wrapMethod", "text")

                session.on("change", function() {
                    if (isEditorContentsBeingSetByApplication) return
                    const newEditorContents = getEditorContents()
                    currentItem.value = newEditorContents
                    // optimization with wasEditorDirty to prevent unneeded redraws
                    const isDirty = isEditorDirty()
                    if (isDirty !== wasEditorDirty) {
                        if (isDirty && !isLastEntityAttributeMatch) {
                            Toast.toast("You are not editing the latest value for this entity's attribute")
                        }
                        wasEditorDirty = isDirty
                        updateIsLastMatch()
                        // Use setTimeout to give undo manager some time to update itself
                        setTimeout(m.redraw, 0)
                    }
                })

                // disable "Missing semicolon" warning for JavaScript
                session.on("changeMode", (e, session) => {
                    if("ace/mode/javascript" === session.getMode().$id) {
                        if(session.$worker) {
                            session.$worker.send("changeOptions", [{
                                asi: true
                            }])
                        }
                    }
                })
                

                // Bind a key for saving
                editor.commands.addCommand({
                    name: "save",
                    bindKey: {win: "Ctrl-S",  mac: "Command-S"},
                    exec: function() {
                        save()
                        // Need to redraw here because this event handling is outside of Mithril
                        m.redraw()
                    },
                    readOnly: false
                })

                if (startupGoToKey) {
                    setTimeout(() => {
                        goToKey(startupGoToKey.key, startupGoToKey.options)
                        startupGoToKey = null
                    }, 0)
                }
            },
            onupdate: function() {
                editor.resize()
            }
        })
    }

    function viewSplitter() {
        return m("div.bg-light-gray", {
            // splitter for resizing the editor's height
            style: { cursor: "ns-resize", height: "0.33rem" },
            draggable: true,
            ondragstart: (event) => {
                dragOriginY = event.screenY
                event.dataTransfer.setData("Text", event.target.id)
                event.dataTransfer.effectAllowed = "none"
            },
            ondragend: (event) => {
                const yDifference = event.screenY - dragOriginY
                const lineDifference = Math.floor(yDifference / editor.renderer.lineHeight)
                aceEditorHeight = parseInt(aceEditorHeight) + lineDifference
                if (aceEditorHeight < 5) { aceEditorHeight = 5 }
                if (aceEditorHeight > 100) { aceEditorHeight = 100 }
            },
        })
    }

    function viewStartupItem()  {
        const helpText = "Whether to run this snippet when the editor starts up -- snippets run in the order they were added"
        const startupInfo = getStartupInfo()
        const isStartupItem = startupInfo.startupItemIds.indexOf(currentItemId) !== -1

        function toggleUseAtStartup(isStartupItem, itemId) {
            const startupInfo = getStartupInfo()
            if (isStartupItem) {
                const index = startupInfo.startupItemIds.indexOf(itemId)
                if (index > -1) {
                    startupInfo.startupItemIds.splice(index, 1)
                    setStartupInfo(startupInfo)
                }
            } else {
                startupInfo.startupItemIds.push(itemId)
                setStartupInfo(startupInfo)
            }

        }

        function showBootstrapItems() {
            if (!confirm("Show startup items in editor?")) return
            if (!confirmClear()) return
            setEditorContents(JSON.stringify(startupInfo, null, 4))
        }

        return [
            m("input[type=checkbox].ma1", {
                checked: isStartupItem,
                disabled: currentNotebook !== Twirlip7.NotebookUsingLocalStorage,
                onclick: toggleUseAtStartup.bind(null, isStartupItem, currentItemId),
                title: helpText
            }),
            m("span", { title: helpText, onclick: showBootstrapItems }, "Bootstrap it"),
        ]
    }

    function viewEvaluateButtons() {
        return [
            m("button.ma1", { onclick: doIt, title: "Evaluate selected code" }, icon("fa-play.mr1"), "Do it"),
            m("button.ma1", { onclick: printIt, title: "Evaluate code and insert result in editor" }, icon("fa-print.mr1"), "Print it"),
            m("button.ma1", { onclick: inspectIt, title: "Evaluate code and log result to console"  }, icon("fa-eye.mr1"), "Inspect it"),
            m("button.ma1", { onclick: launchIt, title: "Launch current saved snippet in a new window" }, icon("fa-external-link.mr1"), "Launch it"),
            viewStartupItem()
        ]
    }

    function viewSpacer() {
        return m("span.pa1")
    }

    function viewSaveButton() {
        return m("button.ma1.ml2.mr3", {
            style: (isEditorDirty() ? "text-shadow: 1px 0px 0px black" : ""),
            onclick: save,
            title: "Add a new version of the value of the entity's attribute to the current notebook"
        }, icon("fa-share-square-o.mr1"), "Save item to " + notebookChoice)
    }

    const importExportMenu = {
        view: () => Twirlip7.menu("Import/Export", importExportMenu),
        minWidth: "20rem",
        isOpen: false,
        items: [
            // This use of m outside a view function creates vnodes which are not diffed every view -- should be OK for static icons
            { onclick: importTextPlain, title: "Load a file into editor", name: [icon("fa-upload.mr1"), "Import"]},
            { onclick: importTextAsBase64, title: "Load a file into editor as base64", name: [icon("fa-file-image-o.mr1"), "Import image as Base64" ]},
            { onclick: exportText, title: "Save current editor text to a file", name: [icon("fa-download.mr1"), "Export"] },
            { onclick: displayDataURLForCurrentNote, title: "Print the current item in the editor as a data URL (to copy)", disabled: () => !currentItemId, name: [icon("fa-print.mr1"), "Print data URL for current item"] },
            { onclick: displayDataURLForCurrentNoteAndHistory, title: "Print the current item and its entire derived-from history in the editor as data URLs (to copy)", disabled: () => !currentItemId, name: [icon("fa-history.mr1"), "Print entire history for item as data URLs"] },
            { onclick: readNotesFromDataURLs, title: "Read one or more items from data URLs in the editor (like from a paste) and save them into the current notebook", name: [icon("fa-plus-square-o.mr1"), "Create items from data URLs in editor"] },
        ]
    }

    function viewImportExportButtons() {
        return m(importExportMenu)
    }

    function isCurrentNotebookLoading() {
        return notebookChoice === "server" && !Twirlip7.NotebookUsingServer.isLoaded()
    }

    const notebookMenu = {
        view: () => Twirlip7.menu("Notebook operations", notebookMenu),
        minWidth: "20rem",
        isOpen: false,
        items: [
            { disabled: isCurrentNotebookLoading, onclick: showCurrentNotebook, title: "Put JSON for current notebook contents into editor", name: "Show current notebook" },
            { disabled: isCurrentNotebookLoading, onclick: showExampleNotebook, title: "Put JSON for a notebook of example snippets into editor (for loading afterwards)", name: "Show example notebook" },
            { disabled: isCurrentNotebookLoading, onclick: mergeNotebook, title: "Load notebook from JSON in editor -- merging with the previous items", name: "Merge notebook" },
            { disabled: isCurrentNotebookLoading, onclick: replaceNotebook, title: "Load notebook from JSON from editor -- replacing all previous items!", name: "Replace notebook" },
        ]
    }

    function viewNotebookButtons() {
        return m(notebookMenu)
    }

    function viewExtensionsHeader() {
        return m("#extensionsHeader", extensionsCallForTag("header", "view"))
    }

    function viewExtensionsMiddle() {
        return m("#extensionsMiddle", extensionsCallForTag("middle", "view"))
    }

    function viewExtensionsFooter() {
        return m("#extensionsFooter", extensionsCallForTag("footer", "view"))
    }

    function viewMain() {
        return [
            Progress.viewProgress(),
            Toast.viewToast(),
            viewAbout(),
            focusMode ? [] : viewExtensionsHeader(),
            focusMode ? [] : viewNavigate(),
            focusMode ? [] : viewContext(),
            viewEditor(),
            focusMode ? [] : viewAuthor(),
            focusMode ? [] : viewExtensionsMiddle(),
            viewEvaluateButtons(),
            focusMode ? viewSpacer() : [],
            focusMode ? viewSaveButton() : [],
            focusMode ? [] : viewSpacer(),
            focusMode ? [] : viewImportExportButtons(),
            focusMode ? [] : viewSpacer(),
            focusMode ? [] : viewNotebookButtons(),
            viewSplitter(),
            focusMode ? [] : viewExtensionsFooter(),
        ]
    }

    function view() {
        return m("#main.ma2", [
            m("div.bg-lightest-blue.pa1.w-100", {
                style: "padding-bottom: 0.5rem; display:" + (collapseWorkspace ? "block" : "none"),
                onclick: () => collapseWorkspace = false,
                title: "click here to show the editor",
            }, m("span.ml2", "Twirlip7 Editor"), m("button.fr", { style: "min-width: 1.5rem", title: "Click here to expand the editor" }, "+")),
            m("div", {
                style: "display: " + (collapseWorkspace ? "none" : "initial")
            }, viewMain())
        ])
    }

    return {
        oninit,
        view,
        show,

        newItem,
        goToKey,
        getStartupInfo,
        setStartupInfo,
        restoreNotebookChoice,
        setEditorContents,
        fetchStoredItemId,

        // Extra accessors for extensions

        extensionsInstall,
        extensionsUninstall,

        toast: Toast.toast,
        confirmClear,
        getEditorContents,
        isEditorDirty,

        getSelectedEditorText,
        getSelection,
        doIt,
        printIt,
        inspectIt,
        launchIt,

        icon,

        replaceSelection,
        insertText,

        // Extra accessors for other users

        getCurrentItem() {
            return currentItem
        },
        getCurrentItemId() {
            return currentItemId
        },
        getCurrentNotebook() {
            return currentNotebook
        },
        getNotebookChoice() {
            return notebookChoice
        },
        getCurrentContributor() {
            return currentContributor
        },
        setCurrentContributor(contributor) {
            currentContributor = contributor
        },
        getEditorMode() {
            return editorMode
        },
        getEditor() {
            return editor
        }
    }
}
