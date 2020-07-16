/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

let errorMessage = ""
let chosenFileName = ""
let mboxContents = null
let chosenFileLoaded = false

let emails = []

function showError(error) {
    errorMessage = error
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    mboxContents = null
    chosenFileLoaded = false
    const apiResult = await twirlip15ApiCall({request: "file-contents", fileName: chosenFileName}, showError)
    if (apiResult) {
        mboxContents = apiResult.contents
        chosenFileLoaded = true
    } else {
        mboxContents = ""
    }
    splitEmails()
}

function splitEmails() {
    const emailsRaw  = mboxContents.split("From ")
    emailsRaw.splice(0, 1)
    emails = emailsRaw
}

function viewFileContents() {
    return m("div", emails.map(email => {
        const lines = email.split("\n")
        return m("div", 
            m("pre", "From " + lines.slice(0, 4).join("\n")), 
            m("hr")
        )
    }))
}

const ViewMail = {
    view: () => {
        return m("div.ma2",
            errorMessage && m("div.red", m("span", {onclick: () => errorMessage =""}, "X "), errorMessage),
            !chosenFileName && m("div",
                "file not specified in URL querystring"
            ),
            chosenFileName && !chosenFileLoaded && mboxContents === null && m("div",
                "Loading..."
            ),
            chosenFileName && chosenFileLoaded && m("div",
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewMail)
