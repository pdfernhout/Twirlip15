"use strict"

// import { sha256 } from "../../vendor/sha256.js"

/* global sha256 */

// A NotebookBackend maintains an ordered collection of items (JSON objects).
// Each item can be referenced by its zero-based position
// or by the SHA256 of its canonical JSON representation.
// This collection (stream) is stored in memory.
// A Store can be connected to the NotebookBackend for persistence.

export function NotebookBackend(store, defaultOLoadedCallback=null) {

    let itemForLocation = []
    let itemForHash = {}

    let isLoaded = false
    let onLoadedCallback = defaultOLoadedCallback

    function getCapabilities() {
        return {
            canClear: !store || !!store.clearItems
        }
    }

    async function addItem(item) {
        const storedItem = addItemToMemory(item)
        if (store && !storedItem.existed) {
            // TODO: Double check and fix this for store as needed
            const storeResult = store.addItemAsync
                ? await store.addItemAsync(item)
                : store.addItem(item)
            if (storeResult && storeResult.error) {
                storedItem.error = storeResult.error 
            }
        }
        return storedItem
    }

    function addItemToMemory(item) {
        const reference = "" + sha256(item)
        const storedItem = itemForHash[reference]
        if (storedItem) {
            return { id: reference, location: storedItem.location, existed: true }
        }
        const newLocation = itemForLocation.length
        const newStoredItem = { id: reference, location: newLocation, item: item }
        itemForLocation.push(newStoredItem)
        itemForHash[reference] = newStoredItem
        const result = { id: reference, location: newLocation, existed: false }
        return result
    }

    function onAddItem(item) {
        addItemToMemory(item)
    }

    function getItem(reference) {
        if (reference === null) return null
        const storedItem = itemForHash[reference]
        const result = storedItem ? storedItem.item : null
        return result
    }

    function getItemForLocation(location) {
        const storedItem = itemForLocation[location]
        const result = storedItem ? storedItem.item : null
        return result
    }

    // Return this value directly
    // Track this separately as it is used a lot and pertains to entire collection
    // Updating this value will also involve a callback about new items
    function itemCount() {
        const result = itemForLocation.length
        return result
    }

    function textForNotebook() {
        const result = []
        for (let i = 0; i < itemForLocation.length; i++) {
            const storedItem = itemForLocation[i]
            result.push(storedItem.item)
        }
        const resultAsJSON = JSON.stringify(result, null, 4)
        return resultAsJSON
    }

    function reset() {
        isLoaded = false
        itemForLocation = []
        itemForHash = {}
    }

    function clearItems() {
        if (itemCount() && store) {
            if (!store.clearItems) {
                throw new Error("clearItems not supported for current store")
            }
            store.clearItems()
        }
        itemForLocation = []
        itemForHash = {}
        return true
    }

    async function loadFromNotebookText(notebookText) {
        const items = JSON.parse(notebookText)
        clearItems()
        for (let item of items) { await addItem(item) }
        return true
    }

    function locationForKey(key) {
        if (key === null || key === "") return null
        const storedItem = itemForHash[key]
        const result = storedItem ? storedItem.location : null
        return result
    }

    function keyForLocation(location) {
        const storedItem = itemForLocation[location]
        const result = storedItem ? storedItem.id : null
        return result
    }

    // Returns newLocation
    function skip(start, delta, wrap) {
        const numberOfItems = itemCount()
        if (numberOfItems === 0) return null
        if (start === null || start === undefined) {
            if (wrap) {
                // when wrapping, want +1 to go to 0 or -1 to go to end
                if (delta === 0) {
                    start = 0
                } else if (delta > 0) {
                    start = -1
                } else {
                    start = numberOfItems
                }
            } else {
                // if not wrapping, negative deltas get us nowhere, and positive deltas go from start
                start = -1
            }
        }

        let newLocation
        if (wrap) {
            delta = delta % numberOfItems
            newLocation = (start + delta + numberOfItems) % numberOfItems
        } else {
            newLocation = start + delta
            if (newLocation < 0) newLocation = 0
            if (newLocation >= numberOfItems) newLocation = numberOfItems - 1
        }
        return newLocation
    }

    function setup() {
        if (store && store.setup) store.setup()
    }

    function setOnLoadedCallback(callback) {
        onLoadedCallback = callback
    }

    function onLoaded() {
        if (onLoadedCallback) {
            isLoaded = true
            setTimeout(onLoadedCallback, 0)
            onLoadedCallback = null
        } else {
            isLoaded = true
        }
    }

    const stream = {
        getCapabilities,
        addItem,
        getItem,
        getItemForLocation,
        itemCount,
        textForNotebook,
        reset,
        clearItems,
        loadFromNotebookText,
        locationForKey,
        keyForLocation,
        skip,
        setup,
        setOnLoadedCallback,
        onAddItem,
        onLoaded,
        isLoaded: function () {
            return isLoaded
        },
        isAvailable: function () {
            return !store || store.isSetup()
        },
        getStore: function() {
            return store
        }
    }

    if (store) {
        const connectToStore = async () => {
            await store.connect(stream)
            if (store.loadFile) {
                await store.loadFile()
            }
        }
        connectToStore()
    } else {
        onLoaded()
    }

    return stream
}
