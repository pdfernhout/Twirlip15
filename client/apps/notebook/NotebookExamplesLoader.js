"use strict"

/* global m */

import { CanonicalJSON } from "../../common/CanonicalJSON.js"

const exampleNotebookConfigurationFileName = "_exampleNotebookConfiguration.txt"

const url = import.meta.url
const baseDir = url.substring(0, url.lastIndexOf("/")) + "/examples/"

export const NotebookExamplesLoader = {

    async loadFile(fileName) {
        const fullFileName = baseDir + fileName

        const response = await fetch(fullFileName)
        const result = await response.text()
        m.redraw()
        return result
    },

    async loadAllFiles(progressCallback, doneCallback) {
        const response = await fetch(baseDir + exampleNotebookConfigurationFileName)
        const configFileContents = await response.text()
        m.redraw()
        // console.log("configFileContents", configFileContents)
        NotebookExamplesLoader.loader(configFileContents, progressCallback, doneCallback)
    },

    async loader(configFileContents, progressCallback, doneCallback) {
        const inputLines = configFileContents.split("\n")

        const output = []

        const item = {
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

        let savedAttribute = ""

        for (let i = 0; i < inputLines.length; i++) {
            const inputLine = inputLines[i]
            progressCallback("Processing example config file line " + (i + 1) + " of " + inputLines.length)
            m.redraw()
            if (!inputLine) continue
            if (inputLine.startsWith("//")) continue
            if (inputLine.startsWith("{")) {
                const defaultProperties = JSON.parse(inputLine)
                for (let key in defaultProperties) {
                    if (key === "attribute") {
                        // treat attribute special so we know if we can use file name instead
                        savedAttribute = defaultProperties[key]
                    } else {
                        item[key] = defaultProperties[key]
                    }
                }
                continue
            }
            const fileName = inputLine.trim()

            const fileContents = await NotebookExamplesLoader.loadFile(fileName)

            item.attribute = savedAttribute || fileName
            item.value = fileContents
            output.push(CanonicalJSON.stringify(item))
        }

        doneCallback(output)
        m.redraw()
    }
}
