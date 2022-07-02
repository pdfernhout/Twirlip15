import { Twirlip15ServerAPI, loadLargeFileContents, fileAppendLater } from "./twirlip15-api.js"

// Triple fields:
// a: subject, typically a UUID of the form "type|uuidv4"
// b: field or relation, typically a meaningful string like "creationDate" 
// c: value, typically a UUID or plain text, but may be a unicode string of any intended content type
// ct: optional hint about the content type of c; usually text or uuid of unspecified; "number" or "json" may be common uses
// o: operation, may be replace, insert, clear, or undefined (which is the same as replace)

function isString(value) {
    return typeof value === "string"
}

export function Triplestore(showError, fileName) {

    let triples = []

    const progressObject = {
        fileName,
        isFileLoaded: false,
        isFileLoading: false,
        status: "",
        error: null
    }
    
    // triplesByA is to optimize lookup in common case
    let triplesByA = {}

    const TwirlipServer = new Twirlip15ServerAPI(showError)

    function setFileName(newFileName) {
        fileName = newFileName
    }

    async function createNewFile(successCallback) {
        const apiResult = await TwirlipServer.fileSave(fileName, "")
        if (apiResult && successCallback) {
            successCallback()
        }
        return apiResult
    }

    async function loadFileContents() {
        if (!fileName) return showError(new Error("fileName not set yet"))

        const chosenFileContents = await loadLargeFileContents(TwirlipServer, fileName, progressObject)

        if (chosenFileContents) {
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
    function addTripleABC(a, b, c, ct=undefined) {
        if (ct) return addTriple({a, b, c, ct})
        return addTriple({a, b, c})
    }

    function addTriple(triple, write=true) {
        if (!triple.ct && typeof triple.c === "number") {
            // Auto conversion of numbers
            triple.c = String(triple.c)
            triple.ct = "number"
        }
        if (!isString(triple.a) ||
            !isString(triple.b) ||
            !isString(triple.c) ||
            (triple.ct && !isString(triple.ct))
        ) {
            return showError(new Error("triple fields must be strings: " + JSON.stringify(triple)))
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

        if (write) {
            const stringToAppend = JSON.stringify(triple, ignoreIndexField)
            fileAppendLater(TwirlipServer, fileName, stringToAppend)
        }
    }

    function ignoreIndexField(key, value) {
        if (key === "index") return undefined
        return value
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
        return progressObject
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
