/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
import parse from "../../vendor/emailjs/mimeparser.js"
import { base64decode } from "../../vendor/base64.js"
import base64encode from "../../vendor/emailjs/base64-encode.js"
import { FileUtils } from "../../common/FileUtils.js"

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

const TwirlipServer = new Twirlip15ServerAPI(showError)

async function loadPartialFile(fileName, start, length) {
    const apiResult = await TwirlipServer.fileReadBytes(fileName, start, length, "base64")
    if (apiResult) {
        return apiResult.data
    }
    return false
}

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    mboxContents = null
    chosenFileLoaded = false

    const apiResult = await TwirlipServer.fileStats(chosenFileName)
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
        // new TextDecoder("utf-8").decode(uint8array)
        // iso8859-1
        segments.push(base64decode(data, new TextDecoder("ascii")))
        start += chunkSize
    }

    showStatus("done loading data; processing")

    // Give the UI a chance to update through using a timeout
    setTimeout(async () => {
        mboxContents = segments.join("")
        if (chosenFileName.endsWith(".msf")) {
            await processMailSummaryFile()
        } else {
            await processEmails()
        }
        showStatus("")
        chosenFileLoaded = true
        m.redraw()
    }, 10)
}

async function processMailSummaryFile() {
    // Unfinished -- maybe not worth dealing with complex format
    console.log("mboxContents", mboxContents)
    const lines = mboxContents.split("\r")
    console.log("lines", lines)
    emails = []
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function processEmails() {
    const emailsRaw = mboxContents.split(/^From /m)
    emailsRaw.splice(0, 1)
    const result = []
    for (let i = 0; i < emailsRaw.length; i++) {
        const emailRaw = emailsRaw[i]
        try {
            const parsedEmail = processEmail("From " + emailRaw)
            // console.log(parsedEmail.headers.subject[0].value)
            // logMimeParts(parsedEmail)
            result.push(parsedEmail)
        } catch {
            console.log("Could not parse email", emailRaw)
        }
        if (i % 10 === 9) {
            showStatus("processing email " + (i + 1) + " of " + emailsRaw.length)
            m.redraw()
            await timeout(1)
        }
    }
    // console.log("mimeTypeCounts", JSON.stringify(mimeTypeCounts, null, 4))
    // console.log("mimeLog", mimeLog)
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
let showImages = false

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
    let result = ""
    if (message.contentType.value === "text/plain") {
        result += new TextDecoder("utf-8").decode(message.content)
    }
    // if (message.content) return new TextDecoder("utf-8").decode(message.content)
    for (let i = 0; i < message.childNodes.length; i++) {
        const node = message.childNodes[i]
        // eslint-disable-next-line no-unused-vars
        const text = getTextPlain(node)
        if (text) result += "\n" + text
    }
    return result
}

let mimeTypeCounts = {}
let mimeLog = ""
const paddingString = "                                                               "

// Recursive
function logMimeParts(message, indent=4) {
    /*
    if (message.contentType.value === "text/plain") {
        console.log("text/plain contents: ", new TextDecoder("utf-8").decode(message.content))
    } else {
        console.log("not text/plain", message.contentType.value, message.content)
    }
    */
    if (!mimeTypeCounts[message.contentType.value]) mimeTypeCounts[message.contentType.value] = 0
    mimeTypeCounts[message.contentType.value]++
    // eslint-disable-next-line no-unused-vars
    mimeLog += paddingString.substring(0, indent) + message.contentType.value + "\n"
    for (let i = 0; i < message.childNodes.length; i++) {
        const node = message.childNodes[i]
        // eslint-disable-next-line no-unused-vars
        logMimeParts(node, indent + 4)
    }
}

// Recursive
function viewEmailPart(message) {
    let result = []
    if (message.contentType.value === "text/plain") {
        result.push(m("pre.ml5.pre-wrap", new TextDecoder("utf-8").decode(message.content)))
    }
    if (message.contentType.value.startsWith("application/")) {
        const fileName = (message.contentType.params && message.contentType.params.name) || "unspecified.dat"
        // console.log("application/", message.contentType.value)
        result.push(m("div.ml5", m("button", { onclick: () => FileUtils.saveToFile(fileName, message.content) }, "Export: " + fileName)))
    }
    if (showImages && message.contentType.value.startsWith("image/")) {
        const encodedImage = base64encode(message.content)
        const alt = (message.contentType.params && message.contentType.params.name) || "An unspecified image"
        result.push(m("img[alt='a title']", {
            src: "data:" + message.contentType.value + ";base64, " + encodedImage,
            alt,
            title: alt
        }))
    }
    for (let i = 0; i < message.childNodes.length; i++) {
        const node = message.childNodes[i]
        result.push(viewEmailPart(node))
    }
    return result
}

function viewEmail(message) {
    let subject = "MISSING SUBJECT"
    try {
        subject = message.headers.subject[0].value
    } catch {
       console.log("missing subject", message)
    }
    const from = getFromField(message)
    let date = "MISSING DATE"
    try {
        date = message.headers.date[0].value
    } catch {
        console.log("missing date", message)
    }
    const rawMessageId = message.headers["message-id"] || message.headers["Message-Id"]
    if (!rawMessageId || !rawMessageId[0]) {
        console.log("Issue with messageId for: ", message.headers)
        return m("pre", "Issue with messageId for: " + JSON.stringify(message.headers, null, 4))
    }
    const messageId = rawMessageId[0].initial
    // const body = getTextPlain(message)
    const body = viewEmailPart(message)
    return m("div", 
        m("div", 
            m("div.ml4", date),
            m("div.ml4", from),
            m("div.ml4", { onclick: () => {
                expandedMessage[messageId] = !expandedMessage[messageId]
                if (expandedMessage[messageId]) {
                    console.log("message", message)
                    // logMimeParts(message)
                }
            } }, expandedMessage[messageId] ? "▼ " : "➤ ", subject),
            expandedMessage[messageId] && m("div",
                m("div.dib.ml5", m("label", 
                    m("input[type=checkbox].mr1", {
                        checked: showRaw,
                        onclick: () => showRaw = !showRaw
                    }),
                    "Show Raw"
                )),
                m("div.dib.ml3", m("label", 
                    m("input[type=checkbox].mr1", {
                        checked: showImages,
                        onclick: () => showImages = !showImages
                    }),
                    "Show Attached Images"
                )),
                // !showRaw && m("pre.ml5.measure-wide.pre-wrap", body),
                !showRaw && body,
                showRaw && m("pre.ml5.measure-wide.pre-wrap", message.raw),
            )
        )
    )
}

function doesEmailContainSearchString(email) {
    let searchResult = email.raw.search(new RegExp(searchString, searchIgnoreCase ? "i" : ""))
    // Might need recursive search to do this completely
    if (searchResult === -1 && email.contentType.value === "text/plain"
        && email.contentTransferEncoding && email.contentTransferEncoding.value === "base64") {
        const content = new TextDecoder("utf-8").decode(email.content)
        searchResult = content.search(new RegExp(searchString, searchIgnoreCase ? "i" : ""))
    }
    if (!searchInvert && searchResult === -1) return false
    if (searchInvert && searchString && searchResult !== -1) return false
    return true
}

function viewEmails() {
    if (!searchString && !searchInvert) return []
    return m("div", emails.map(email => {
        if (!doesEmailContainSearchString(email)) return []
        return [
            viewEmail(email),
            m("hr")
        ]
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
                viewEmails()
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewMail)
