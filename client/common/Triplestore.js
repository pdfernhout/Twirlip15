import { Twirlip15ServerAPI } from "./twirlip15-api.js"
import { base64decode } from "../vendor/base64.js"

// Future design ideas for API:
// triples[id]["+"].map(...)
// triples[id]["+"].last()
// triples[id]["+"]["some data"].store()
// triples.o100000676.plus.102323232.store()

function isString(value) {
    return typeof value === "string"
}

export function Triplestore(showError, fileName) {

    let triples = []
    let isFileLoaded = false
    let isFileLoading = false
    let isFileSaveInProgress = 0

    // triplesByA is to optimize lookup in common case
    let triplesByA = {}

    const TwirlipServer = new Twirlip15ServerAPI(showError)

    function setFileName(newFileName) {
        fileName = newFileName
    }

    async function createNewFile(successCallback) {
        isFileSaveInProgress++
        let apiResult
        try {
            apiResult = await TwirlipServer.fileSave(fileName, "")
        } finally {
            isFileSaveInProgress--
        }
        if (apiResult && successCallback) {
            successCallback()
        }
        return apiResult
    }

    async function loadPartialFile(fileName, start, length) {
        const apiResult = await TwirlipServer.fileReadBytes(fileName, start, length, "base64")
        if (apiResult) {
            return apiResult.data
        }
        return false
    }

    function showStatus(text) {
        console.log("showStatus", text)
    }

    async function loadFileContents() {
        if (!fileName) return showError(new Error("fileName not set yet"))
        isFileLoaded = false

        const apiResult = await TwirlipServer.fileStats(fileName)
        if (!apiResult) return

        const fileSize = apiResult.stats.size
        if (!fileSize) {
            isFileLoaded = true
            return
        }

        isFileLoading = true
    
        const segments = []
        const chunkSize = 1200000
        let start = 0
        while (start < fileSize) {
            showStatus("reading: " + start + " of: " + fileSize + " (" + Math.round(100 * start / fileSize) + "%)")
            const countToRead = Math.min(chunkSize, fileSize - start)
            const data = await loadPartialFile(fileName, start, countToRead)
            if (data === false) {
                console.log("Unexpected: got false")
                showStatus("")
                showStatus("reading failed at end")
                isFileLoading = false
                return
            }
            // new TextDecoder("utf-8").decode(uint8array)
            // iso8859-1
            segments.push(base64decode(data, new TextDecoder("ascii")))
            start += chunkSize
        }
    
        showStatus("done loading data; processing")
    
        if (apiResult) {
            const chosenFileContents = segments.join("")
            const lines = chosenFileContents.split("\n")
            triples = []
            triplesByA = {}
            let index = 1
            for (const line of lines) {
                if (line.trim()) {
                    let triple
                    try {
                        triple = JSON.parse(line)
                    } catch (error) {
                        console.log("problem parsing line:", "\"" + line + "\"", "error:", error)
                        continue
                    }
                    if (triple.a === undefined|| triple.b === undefined || triple.c === undefined) {
                        console.log("problem parsing line:", "\"" + line + "\"", "error:", "a, b, or c is undefined")
                        continue  
                    }
                    triple.index = index++
                    addTriple(triple, false)
                }
            }
            isFileLoaded = true
        }
        isFileLoading = false
    }
    
    async function appendFile(stringToAppend, successCallback) {
        if (!fileName) return showError(new Error("fileName not set yet"))
        // if (isFileSaveInProgress) return showError(new Error("Previous file save still in progress!"))
        isFileSaveInProgress++
        let apiResult
        try {
            apiResult = await TwirlipServer.fileAppend(fileName, stringToAppend)
        } finally {
            isFileSaveInProgress--
        }
        if (apiResult && successCallback) {
            successCallback()
        }
    }

    function _removeTriple(triple) {
        if (!triplesByA[triple.a]) return
        for (let i = triplesByA[triple.a].length - 1; i > 0; i--) {
            const existingTriple = triplesByA[triple.a][i]
            if (existingTriple.a === triple.a && existingTriple.b === triple.b && existingTriple.c === triple.c) {
                existingTriple.ignore = true
                return
            }
        }
    }

    function _replaceTriple(triple) {
        if (!triplesByA[triple.a]) return
        for (let i = triplesByA[triple.a].length - 1; i > 0; i--) {
            const existingTriple = triplesByA[triple.a][i]
            if (existingTriple.a === triple.a && existingTriple.b === triple.b) {
                existingTriple.ignore = true
            }
        }
    }

    // Convenience function
    async function addTripleABC(a, b, c) {
        return await addTriple({a, b, c})
    }

    async function addTriple(triple, write=true, successCallback) {
        if (!isString(triple.a) ||
            !isString(triple.b) ||
            !isString(triple.c)
        ) {
            return showError(new Error("triple fields must be strings: " + JSON.stringify(triple)))
        }
        if ( write && (
            !triple.a.includes(":") ||
            // !triple.b.includes(":") ||
            (triple.c && !triple.c.includes(":"))
            )
        ) {
            return showError(new Error("triple fields A & C must have type at start with a colon: " + JSON.stringify(triple)))
        }
        if (!triple.a || !triple.b) return showError(new Error("Triple a and b fields must be non-empty"))
        triple.index = triples.length + 1
        if (triple.o === "remove") {
            // removes the most recent exact a,b,c match
            _removeTriple(triple)
            triple.ignore = true
        } else if (triple.o === "replace" || !triple.o) {
            // removes all a,b matches and sets c value
            _replaceTriple(triple)
        } else if (triple.o === "clear") {
            // removes all a,b matches and leaves no c value
            _replaceTriple(triple)
            triple.ignore = true
        }
        triples.push(triple)

        // Update optimization cache
        if (!triplesByA[triple.a]) triplesByA[triple.a] = []
        triplesByA[triple.a].push(triple)

        try {
            if (write) await appendFile(JSON.stringify(triple) + "\n", successCallback)
        } catch(e) {
            showError(e)
        }
    }

    function filterTriples(filterTriple, showIgnored=false) {
        const result = []
        let triplesToSearch = triples
        if (filterTriple.a) {
            triplesToSearch = triplesByA[filterTriple.a] || []
        }
        for (const triple of triplesToSearch) {
            if (!showIgnored && (triple.ignore || triple.o === "remove")) continue
            if (filterTriple.a && filterTriple.a !== triple.a) continue
            if (filterTriple.b && filterTriple.b !== triple.b) continue
            if (filterTriple.c && filterTriple.c !== triple.c) continue
            result.push(triple)
        }
        return result
    }

    function find(a, b, c, showIgnored=false) {
        if (a === "" || b === "") {
            return showError(new Error("triple a and b fields can't be empty strings; use null for query"))
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
        const result = filterTriples({a, b, c}, showIgnored)
        if (wildcardCount === 1) return result.map(triple => triple[lastWildcard])
        return result
    }
    
    function last(triples) {
        if (triples.length === 0) return null
        return triples[triples.length - 1]
    }

    function findLast(a, b, c) {
        return this.last(this.find(a, b, c, false))
    }

    function getLoadingState() {
        return {
            fileName,
            isFileLoaded,
            isFileLoading,
            isFileSaveInProgress,
        }
    }

    return {
        setFileName,
        createNewFile,
        loadFileContents,
        addTriple,
        addTripleABC,
        filterTriples,
        find,
        last,
        findLast,
        getLoadingState,
    }
}
