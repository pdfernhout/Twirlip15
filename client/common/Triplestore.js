import { Twirlip15ServerAPI } from "./twirlip15-api.js"

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

    async function loadFileContents() {
        if (!fileName) return showError(new Error("fileName not set yet"))
        isFileLoaded = false
        isFileLoading = true
        const apiResult = await TwirlipServer.fileContents(fileName)
        if (apiResult) {
            const chosenFileContents = apiResult.contents
            const lines = chosenFileContents.split("\n")
            triples = []
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
        for (let i = triples.length - 1; i > 0; i--) {
            const existingTriple = triples[i]
            if (existingTriple.a === triple.a && existingTriple.b === triple.b && existingTriple.c === triple.c) {
                existingTriple.ignore = true
                return
            }
        }
    }

    function _replaceTriple(triple) {
        for (let i = triples.length - 1; i > 0; i--) {
            const existingTriple = triples[i]
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
        try {
            if (write) await appendFile(JSON.stringify(triple) + "\n", successCallback)
        } catch(e) {
            showError(e)
        }
    }

    function filterTriples(filterTriple, showIgnored=false) {
        const result = []
        for (const triple of triples) {
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
