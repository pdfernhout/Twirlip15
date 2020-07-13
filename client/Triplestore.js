import { twirlip15ApiCall } from "./twirlip15-support.js"

export function Triplestore(showError) {

    let triples = []
    let chosenFileName = null
    let chosenFileLoaded = false
    let fileSaveInProgress = false

    async function loadFileContents(newFileName) {
        chosenFileName = newFileName
        chosenFileLoaded = false
        const apiResult = await twirlip15ApiCall({request: "file-contents", fileName: chosenFileName}, showError)
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
            chosenFileLoaded = true
        }
    }
    
    async function appendFile(fileName, stringToAppend, successCallback) {
        chosenFileName = fileName
        if (fileSaveInProgress) return
        fileSaveInProgress = true
        const apiResult = await twirlip15ApiCall({request: "file-append", fileName, stringToAppend}, showError)
        fileSaveInProgress = false
        if (apiResult && successCallback) {
            successCallback()
        }
    }

    function addTriple(triple) {
        triple.index = triples.length + 1
        triples.push(triple)
        appendFile(chosenFileName, JSON.stringify(triple) + "\n")
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
            fileName: chosenFileName,
            isFileLoaded: chosenFileLoaded,
            isFileSaveInProgress: fileSaveInProgress
        }
    }

    return {
        loadFileContents,
        addTriple,
        filterTriples,
        find,
        last,
        getLoadingState,
    }
}
