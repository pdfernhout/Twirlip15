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
    const emailsRaw  = mboxContents.split(/^From /m)
    emailsRaw.splice(0, 1)
    emails = emailsRaw.map(emailRaw => processEmail("From " + emailRaw))
}

function processEmail(text) {
    const result = {}
    result.raw = text
    result.lines = text.split("\n")
    result.message = parseEmail(text)
    return result
}

function rtrim(string) {
    // Trim trailing space from string
    return string.replace(/\s*$/,"")
}

let unknownIndex = 0

function parseEmail(email) {
    // Derived from Twirlip7 viewer.js

    let headers = ""
    let body = email

    headers = email.split(/\n\s*\n/)[0]
    if (headers.length === email.length) {
        headers = ""
    } else {
        headers = rtrim(headers)
    }
    body = email.substring(headers.length)

    body = body.trim()

    const subject = headers.match(/^Subject: ([^\n\r]*)/m)
    const title = subject ? subject[1] : ""
    const fromMatch = headers.match(/^From: ([^\n\r]*)/m)
    const from = fromMatch ? fromMatch[1]: "UNKNOWN"
    const idMatch = headers.match(/^Message-Id: ([^\n\r]*)/m)
    const id = idMatch ? idMatch[1]: "UNKNOWN:" + unknownIndex++
    const dateMatch = headers.match(/^Date: ([^\n\r]*)/m)
    const dateLong = dateMatch ? dateMatch[1]: "UNKNOWN"
    let date
    try {
        date = new Date(dateLong).toISOString()
    } catch (e) {
        console.log("Bad date", dateLong, email)
        date = dateLong
    }

    let username
    let displayName
    if (from.includes("<")) {
        const emailAddressMatch = from.match(/(.*)<([^>]*)>/)
        displayName = emailAddressMatch ? emailAddressMatch[1] : ""
        username = emailAddressMatch ? emailAddressMatch[2] : from
        displayName = displayName.replace(/"/gi, "")
    } else {
        username = from
        displayName = ""
    }
    username = username.trim()
    displayName = displayName.trim()

    const isoMatch = displayName.match(/=\?iso-8859-1\?q\?([^?]*)/i)
    if (isoMatch) {
        displayName = isoMatch[1].replace("=20", " ")
    }

    if (username.includes("(")) {
        const parenUserName = username
        username = parenUserName.split("(")[0].trim()
        displayName = parenUserName.split("(")[1].split(")")[0].trim()
    }

    username = username.toLowerCase()
    username = username.replace(" at ", "@")

    const message = {
        id,
        sent: date,
        username,
        headers,
        body: body,
        title
    }

    return message
}

const expandedMessage = {}

function viewFileContents() {
    return m("div", emails.map(email => {
        const message = email.message
        return m("div", 
            m("div", 
                m("div.ml4", message.sent),
                m("div.ml4", message.username),
                m("div.ml4", { onclick: () => expandedMessage[message.id] = !expandedMessage[message.id] }, expandedMessage[message.id] ? "▼ " : "➤ ", message.title),
                expandedMessage[message.id] && m("pre.ml5.measure-wide", message.body),
            ),
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
