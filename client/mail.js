/* global m */
import "./vendor/mithril.js"
import { twirlip15ApiCall } from "./twirlip15-support.js"

import parse from "./vendor/emailjs/mimeparser.js"

let errorMessage = ""
let statusMessage = ""
let chosenFileName = ""
let mboxContents = null
let chosenFileLoaded = false

let emails = []

let searchString = ""
let searchIgnoreCase = true
let searchInvert = false

function showError(error) {
    errorMessage = error
}

function showStatus(messageText) {
    statusMessage = messageText
}

async function loadPartialFile(fileName, start, length) {
    const apiResult = await twirlip15ApiCall({request: "file-read-bytes", fileName, start, length, encoding: "base64"}, showError)
    if (apiResult) {
        return apiResult.data
    }
    return false
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    mboxContents = null
    chosenFileLoaded = false

    const apiResult = await twirlip15ApiCall({request: "file-stats", fileName: chosenFileName}, showError)
    if (!apiResult) return

    const fileSize = apiResult.stats.size

    if (!fileSize) return

    const segments = []
    const chunkSize = 1200000
    let start = 0
    while (start < fileSize) {
        showStatus("reading: " + start + " of: " + fileSize + " (" + Math.round(100 * start / fileSize) + "%)")
        const countToRead = Math.min(chunkSize, fileSize - start)
        const data = await loadPartialFile(chosenFileName, start, countToRead)
        if (data === false) {
            console.log("Unexpected: got false")
            showStatus("")
            showStatus("reading failed at end")
            return
        }
        segments.push(atob(data))
        start += chunkSize
    }

    showStatus("done loading data; processing")

    // Give the UI a chance to update through using a timeout
    setTimeout(async () => {
        mboxContents = segments.join("")

        await splitEmails()
        showStatus("")
        chosenFileLoaded = true
        m.redraw()
    }, 10)
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function splitEmails() {
    const emailsRaw  = mboxContents.split(/^From /m)
    emailsRaw.splice(0, 1)
    const result = []
    for (let i = 0; i < emailsRaw.length; i++) {
        const emailRaw = emailsRaw[i]
        result.push(processEmail("From " + emailRaw))
        if (i % 10 === 9) {
            showStatus("processing email " + (i + 1) + " of " + emailsRaw.length)
            m.redraw()
            await timeout(1)
        }
    }
    emails = result
    // emails = emailsRaw.map(emailRaw => processEmail("From " + emailRaw))
}

function processEmail(text) {
    return parse(text)
}

function rtrim(string) {
    // Trim trailing space from string
    return string.replace(/\s*$/,"")
}

let unknownIndex = 0

// eslint-disable-next-line no-unused-vars
function parseEmailRoughAndReady(email) {
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

let showRaw = false

function getFromField(message) {
    const from = message.headers.from[0]
    const address = from.value[0].address
    const name = from.value[0].name
    if (!address && name.includes(" at ") && from.initial.includes(")")) {
        const addressDerivedFromName = name.replace(" at ", "@")
        const nameInsideParens = from.initial.match(/\(([^)]*)\)/)[1]
        return nameInsideParens.trim() + " <" + addressDerivedFromName.trim() + ">"
    }
    return name + " <" + address + ">"
}

// Recursive
function getTextPlain(message) {
    if (message.contentType.value === "text/plain") {
        return new TextDecoder("utf-8").decode(message.content)
    }
    // if (message.content) return new TextDecoder("utf-8").decode(message.content)
    for (let i = 0; i < message.childNodes.length; i++) {
        const node = message.childNodes[i]
        const text = getTextPlain(node)
        if (text) return text
    }
    return ""
}

function viewFileContents() {
    if (!searchString && !searchInvert) return []
    return m("div", emails.map(email => {
        const message = email
        const searchResult = email.raw.search(new RegExp(searchString, searchIgnoreCase ? "i" : ""))
        if (!searchInvert && searchResult === -1) return []
        if (searchInvert && searchString && searchResult !== -1) return []
        const subject = message.headers.subject[0].value
        const from = getFromField(message)
        const date = message.headers.date[0].value
        const messageId = message.headers["message-id"][0].initial
        const body = getTextPlain(message)
        return m("div", 
            m("div", 
                m("div.ml4", date),
                m("div.ml4", from),
                m("div.ml4", { onclick: () => {
                    expandedMessage[messageId] = !expandedMessage[messageId]
                    if (expandedMessage[messageId]) console.log("message", message)
                } }, expandedMessage[messageId] ? "▼ " : "➤ ", subject),
                expandedMessage[messageId] && m("div",
                    m("div.ml5", m("label", 
                        m("input[type=checkbox].mr1", {
                            checked: showRaw,
                            onclick: () => showRaw = !showRaw
                        }),
                        "Show Raw"
                    )),
                    !showRaw && m("pre.ml5.measure-wide.pre-wrap", body),
                    showRaw && m("pre.ml5.measure-wide.pre-wrap", message.raw),
                ),
            ),
            m("hr")
        )
    }))
}

function viewFileSearch() {
    return m("div",
        m("span.mr2", "Search:"),
        m("input", {
            value: searchString, 
            onchange: event => { searchString = event.target.value}
        }),
        m("label.ml1", 
            m("input[type=checkbox].mr1", {
                checked: searchIgnoreCase,
                onclick: () => searchIgnoreCase = !searchIgnoreCase
            }),
            "Ignore case"
        ),
        m("label.ml1", 
            m("input[type=checkbox].mr1", {
                checked: searchInvert,
                onclick: () => searchInvert = !searchInvert
            }),
            "Invert"
        )
    )
}

const ViewMail = {
    view: () => {
        return m("div.ma2",
            errorMessage && m("div.flex-none.red", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
            statusMessage && m("div.flex-none.green", m("span", {onclick: () => statusMessage =""}, "✖ "), statusMessage),
            !chosenFileName && m("div",
                "file not specified in URL querystring"
            ),
            chosenFileName && !chosenFileLoaded && mboxContents === null && m("div",
                "Loading..."
            ),
            chosenFileName && chosenFileLoaded && m("div",
                viewFileSearch(),
                viewFileContents()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewMail)
