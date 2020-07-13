import { twirlip15ApiCall } from "./twirlip15-support.js"

// Future design ideas for API:
// triples[id]["+"].map(...)
// triples[id]["+"].last()
// triples[id]["+"]["some data"].store()
// triples.o100000676.plus.102323232.store()

export function Triplestore(showError, fileName) {

    let triples = []
    let isFileLoaded = false
    let isFileSaveInProgress = false

    function setFileName(newFileName) {
        fileName = newFileName
    }

    async function loadFileContents() {
        if (!fileName) throw new Error("fileName not set yet")
        isFileLoaded = false
        const apiResult = await twirlip15ApiCall({request: "file-contents", fileName}, showError)
        if (apiResult) {
            const chosenFileContents = apiResult.contents
            const lines = chosenFileContents.split("\n")
            const newTriples = []
            let index = 1
            for (const line of lines) {
                if (line.trim()) {
                    let triple
                    try {
                        triple = JSON.parse(line)
                    } catch (error) {
                        console.log("problem parsing line in file", error, line)
                        continue
                    }
                    triple.index = index++
                    newTriples.push(triple)
                }
            }
            triples = newTriples
            isFileLoaded = true
        }
    }
    
    async function appendFile(stringToAppend, successCallback) {
        if (!fileName) throw new Error("fileName not set yet")
        if (isFileSaveInProgress) throw new Error("Error: Previous file save still in progress!")
        isFileSaveInProgress = true
        const apiResult = await twirlip15ApiCall({request: "file-append", fileName, stringToAppend}, showError)
        isFileSaveInProgress = false
        if (apiResult && successCallback) {
            successCallback()
        }
    }

    function addTriple(triple) {
        if (!triple.a || !triple.b) throw new Error("Triple a and b fields must be non-empty")
        triple.index = triples.length + 1
        triples.push(triple)
        appendFile(JSON.stringify(triple) + "\n")
    }

    function filterTriples(filterTriple) {
        const result = []
        for (const triple of triples) {
            if (filterTriple.a && filterTriple.a !== triple.a) continue
            if (filterTriple.b && filterTriple.b !== triple.b) continue
            if (filterTriple.c && filterTriple.c !== triple.c) continue
            result.push(triple)
        }
        return result
    }

    function find(a, b, c) {
        if (a === "" || b === "") {
            throw new Error("triple a and b fields can't be empty strings; use null for query")
        }
        let wildcardCount = 0
        let lastWildcard
        if (a === null || a === undefined) {
            a = ""
            wildcardCount++
            lastWildcard = "a"
        }
        if (b === null || b === undefined) {
            b = ""
            wildcardCount++
            lastWildcard = "b"
        }
        if (c === null || c === undefined) {
            c = ""
            wildcardCount++
            lastWildcard = "c"
        }
        const result = filterTriples({a, b, c})
        if (wildcardCount === 1) return result.map(triple => triple[lastWildcard])
        return result
    }
    
    function last(triples) {
        if (triples.length === 0) return null
        return triples[triples.length - 1]
    }    

    function getLoadingState() {
        return {
            fileName,
            isFileLoaded,
            isFileSaveInProgress,
        }
    }

    return {
        setFileName,
        loadFileContents,
        addTriple,
        filterTriples,
        find,
        last,
        getLoadingState,
    }
}
