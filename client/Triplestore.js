import { twirlip15ApiCall } from "./twirlip15-support.js"

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
        triple.index = triples.length + 1
        triples.push(triple)
        appendFile(JSON.stringify(triple) + "\n")
    }

    function filterTriples(filterTriple) {
        console.log("filterTriples", filterTriple)
        const result = []
        for (const triple of triples) {
            if (filterTriple.a.trim() && filterTriple.a.trim() !== triple.a.trim()) continue
            if (filterTriple.b.trim() && filterTriple.b.trim() !== triple.b.trim()) continue
            if (filterTriple.c.trim() && filterTriple.c.trim() !== triple.c.trim()) continue
            result.push(triple)
        }
        return result
    }

    function find(a, b, c) {
        let wildcardCount = 0
        let lastWildcard
        if (!a) {
            a = ""
            wildcardCount++
            lastWildcard = "a"
        }
        if (!b) {
            b = ""
            wildcardCount++
            lastWildcard = "b"
        }
        if (!c) {
            c = ""
            wildcardCount++
            lastWildcard = "c"
        }
        const result = filterTriples({a, b, c})
        if (wildcardCount === 1) return result.map(triple => triple[lastWildcard])
        return result
    }
    
    function last(triples) {
        if (triples.length === 0) return ""
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
