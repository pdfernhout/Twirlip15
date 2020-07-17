/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"
import { MailParser } from "./vendor/mail-parser.js"

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
    emails = emailsRaw.map(emailRaw => processEmail("From " + emailRaw))
}

function processEmail(text) {
    const result = {}
    result.raw = text
    result.lines = text.split("\n")
    console.log("lines", result.lines)
    try {
        result.headers = MailParser().processHeaders(result.lines)
        console.log("headers", result.headers)
        return result
    } catch {
        return result
    }
}

function viewFileContents() {
    return m("div", emails.map(email => {
        return m("div", 
            m("pre", email.lines.slice(0, 4).join("\n")), 
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
