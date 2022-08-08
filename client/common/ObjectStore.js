import canonicalize from "../vendor/canonicalize.js"
import { ItemStoreUsingServerFiles } from "./ItemStoreUsingServerFiles.js"
import { debounce } from "./timeout.js"

/* global sha256 */
import "../vendor/sha256.js"

const useDebugLogging = false

// Perhaps could read pathDepth from config file in ObjectStore's directory?

export function ObjectStore(redrawCallback, twirlipServer, directoryPath, pathDepth=4) {
    const objects = {}

    const itemStores = {}

    function makeFullFilePath(aString) {
        const fileName = sha256(aString) + ".jsonl"
        let intermediateLevels = ""
        for (let i = 0; i < pathDepth; i++) {
            const subpath = fileName.substring(i * 2, i * 2 + 2) + "/"
            intermediateLevels += subpath
        }
        const fullFilePath = directoryPath + intermediateLevels + fileName
        return fullFilePath
    }

    async function writeTriple(triple) {
        if (!twirlipServer || !directoryPath) return
        const aString = canonicalize(triple.a)
        // Call readTriples to create itemStore if needed
        readTriples(aString)
        itemStores[aString].addItem(triple)
    }

    // Copied from Triplestore
    function isTriple(triple) {
        if (triple.a === undefined || triple.b === undefined || triple.c === undefined) {
            console.log("item is not triple as a, b, or c is undefined: "+ JSON.stringify(triple))
            return false
        }
        return true
    }

    const objectStoreResponder = {
        onLoaded: fileName => {
            if (useDebugLogging) console.log("loaded an object file:", fileName)
            // isFileLoading = false
            // isFileLoaded = true
        },

        onAddItem: triple => {
            if (useDebugLogging) console.log("onAddItem", triple)
            if (isTriple(triple)) o(triple.a, triple.b, triple.c, triple.o, false)
            if (redrawCallback) debounce(() => redrawCallback(), 500)
        }
    }

    async function readTriples(aString) {
        if (!twirlipServer || !directoryPath) return
        if (!itemStores[aString]) {
            const fullFilePath = makeFullFilePath(aString)
            // Seems wasteful to create one of these per object file?
            const showError = error => console.log(error)
            const defaultLoadFailureCallback = () => console.log("loading items file failed for: " + aString)
            itemStores[aString] = ItemStoreUsingServerFiles(showError, redrawCallback, objectStoreResponder, fullFilePath, defaultLoadFailureCallback, twirlipServer, true)
            await itemStores[aString].isLoadedPromise
        }
    }

    function o(a, b, c, operation="replace", write=true) {
        if (useDebugLogging) console.log("---- o", a, b, c, operation, write)

        if (a !== undefined && b  !== undefined && c !== undefined) {
            // Set value
            const aString = canonicalize(a)
            const bString = canonicalize(b)
            const cString = canonicalize(c)
            if (write) writeTriple({a, b, c, o: operation})
            if (!objects[aString]) objects[aString] = {}
            let isMulti = false
            if (operation === "insert" || operation === "remove" || operation === "clear") {
                isMulti = true
            }
            if (useDebugLogging) console.log("operation multi", operation, isMulti)
            if (isMulti) {
                if (operation === "insert") {
                    if (!objects[aString][bString]) objects[aString][bString] = []
                    objects[aString][bString].push(cString)
                } else if (operation === "remove") {
                    if (objects[aString][bString]) {
                        const i = objects[aString][bString].indexOf(cString)
                        if (i) objects[aString][bString].splice(i, 1)
                    }
                } else if (operation === "clear") {
                    if (objects[aString][bString]) {
                        if (useDebugLogging) console.log("clearing")
                        delete objects[aString][bString]
                    }
                } else {
                    throw new Error("unexpected array operation")
                }
            } else {
                objects[aString][bString] = cString
            }
            return objects[aString][bString]
        }

        if (a !== undefined && b !== undefined) {
            // get value
            const aString = canonicalize(a)
            readTriples(aString)
            if (!objects[aString]) return undefined
            const bString = canonicalize(b)
            const cValue = objects[aString][bString]
            if (typeof cValue === "string") return JSON.parse(cValue)
            return cValue.map(v => JSON.parse(v))
        }

        if (a !== undefined) {
            // get entire object
            const aString = canonicalize(a)
            readTriples(aString)
            const internalObject = objects[aString]
            if (useDebugLogging) console.log("object for a", a, aString, objects[aString], JSON.parse(JSON.stringify(objects)))
            if (!internalObject) return undefined
            const object = {}
            for (const bString in internalObject) {
                let bAccessor = JSON.parse(bString)
                if (typeof bAccessor !== "string") {
                    // Kludge to make non-standard fields accessible
                    bAccessor = bString
                }
                const cValue = internalObject[bString]
                if (typeof cValue === "string") {
                    object[bAccessor] = JSON.parse(cValue)
                } else {
                    object[bAccessor] = cValue.map(v => JSON.parse(v))
                }
            }            
            return object
        }

        return objects
        // throw new Error("function parameters needed")
    }

    return o
}

