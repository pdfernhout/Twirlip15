/* global m, showdown */
import "./vendor/mithril.js"
import "./vendor/showdown.js"

let errorMessage = ""
let chosenFileName = ""
let chosenFileContents = null
let chosenFileLoaded = false

async function apiCall(request) {
    let result = null
    errorMessage = ""
    try {
        const response = await fetch("/twirlip15-api", {
            method: "POST",
            headers: {
            "Content-Type": "application/json;charset=utf-8"
            },
            body: JSON.stringify(request)
        })
        if (response.ok) {
            const json = await response.json()
            if (json.ok) {
                result = json
            } else {
                errorMessage = json.errorMessage
            }   
        } else {
            console.log("HTTP-Error: " + response.status, response)
            errorMessage = "API request failed for file contents: " + response.status
        }
    } catch (error) {
        console.log("api call error", error)
        errorMessage = "API call error; see console for details"
    }
    setTimeout(() => m.redraw(), 0)
    return result
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    chosenFileContents = null
    chosenFileLoaded = false
    const apiResult = await apiCall({request: "file-contents", fileName: chosenFileName})
    if (apiResult) {
        chosenFileContents = apiResult.contents
        chosenFileLoaded = true
    } else {
        chosenFileContents = ""
    }
}

function convertMarkdown(text) {
    const converter = new showdown.Converter({simplifiedAutoLink: true})
    const html = converter.makeHtml(text)
    return html
}

function viewFileContents() {
    return m("div", m.trust(convertMarkdown(chosenFileContents)))
}

const ViewMarkdown = {
    view: () => {
        return m("div.ma2.measure-wide",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div",
                "file not specified in URL querystring"
            ),
            chosenFileName && !chosenFileLoaded && chosenFileContents === null && m("div",
                "Loading..."
            ),
            chosenFileName && chosenFileLoaded && m("div",
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = window.location.pathname

m.mount(document.body, ViewMarkdown)

if (filePathFromParams) loadFileContents(filePathFromParams)
