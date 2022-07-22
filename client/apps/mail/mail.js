/* global m */
import "../../vendor/mithril.js"
import { Twirlip15ServerAPI, loadLargeFileContents } from "../../common/twirlip15-api.js"
import base64encode from "../../vendor/emailjs/base64-encode.js"
import { FileUtils } from "../../common/FileUtils.js"
import { ScrolledItemsView } from "../../common/ScrolledItemsView.js"
import { processEmail, getFromField, getToField } from "./emailParsing.js"

let errorMessage = ""
let statusMessage = ""
let chosenFileName = ""
let mboxContents = null
let chosenFileLoaded = false

let emails = []
let matchingEmails = []

let searchString = ""
let searchIgnoreCase = true
let searchInvert = false

let lastSelectedEmail = null

function showError(error) {
    errorMessage = error
}

function showStatus(messageText) {
    statusMessage = messageText
}

const TwirlipServer = new Twirlip15ServerAPI(showError)

async function loadFileContents(newFileName) {
    chosenFileName = newFileName
    mboxContents = null
    chosenFileLoaded = false

    const contents = await loadLargeFileContents(TwirlipServer, chosenFileName, {statusCallback: showStatus})

    if (!contents) return

    mboxContents = contents
    if (chosenFileName.endsWith(".msf")) {
        await processMailSummaryFile()
    } else {
        await processEmails()
    }
    matchingEmails = emails
    showStatus("")
    chosenFileLoaded = true
    m.redraw()
}

async function processMailSummaryFile() {
    // Unfinished -- maybe not worth dealing with complex format
    console.log("mboxContents", mboxContents)
    const lines = mboxContents.split("\r")
    console.log("lines", lines)
    emails = []
}

function makeTimeoutPromise(ms) {
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
            await makeTimeoutPromise(1)
        }
    }
    // console.log("mimeTypeCounts", JSON.stringify(mimeTypeCounts, null, 4))
    // console.log("mimeLog", mimeLog)
    emails = result
    // emails = emailsRaw.map(emailRaw => processEmail("From " + emailRaw))
}

const expandedMessage = {}

let showRaw = false
let showImages = false

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
    const to = getToField(message)
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
    return m("div.relative",
        m("div.ml4", date),
        m("div.ml4", "From: ", from),
        to && m("div.ml4", "To: ", to),
        m("div.ml4", { onclick: () => {
            expandedMessage[messageId] = !expandedMessage[messageId]
            lastSelectedEmail = message
            if (expandedMessage[messageId]) {
                console.log("message", message)
                // logMimeParts(message)
            }
        } }, expandedMessage[messageId] ? "▼ " : "➤ ", subject),
        expandedMessage[messageId] && m("div.fixed.bg-yellow.overflow-visible.z-999",
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
            !showRaw && m("div", body),
            showRaw && m("pre.ml5.measure-wide.pre-wrap", message.raw),
        )
    )
}

function doesEmailContainSearchString(email) {
    if (!searchString) return true
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

function filterEmails() {
    matchingEmails = emails.filter(email => doesEmailContainSearchString(email))
}

function viewEmails() {
    return m(ScrolledItemsView, {
        rowHeight: 100,
        items: matchingEmails,
        viewItem: email => m("div", viewEmail(email), m("hr"))
    })
}

let debounceTimer
const debounce = (callback, time) => {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(callback, time)
}

function viewEmailSearch() {
    return m("div.flex-none",
        m("span.mr2", "Search:"),
        m("input", {
            value: searchString, 
            oninput: event => {
                searchString = event.target.value
                debounce(() => { filterEmails(); m.redraw() }, 500)
                event.redraw = false
            }
        }),
        m("label.ml2", 
            m("input[type=checkbox].mr1", {
                checked: searchIgnoreCase,
                onclick: () => searchIgnoreCase = !searchIgnoreCase
            }),
            "Ignore case"
        ),
        m("label.ml2", 
            m("input[type=checkbox].mr1", {
                checked: searchInvert,
                onclick: () => searchInvert = !searchInvert
            }),
            "Invert"
        ),
        emails && m("span.ml3", "#Items:", emails.length)
    )
}

const ViewMail = {
    view: () => {
        return m("div.h-100.flex.flex-row",
            m("div.ml2.h-100.flex.flex-column.flex-auto",
                { style: { flex: "50%" }},
                errorMessage && m("div.flex-none.red", m("span", {onclick: () => errorMessage =""}, "✖ "), errorMessage),
                statusMessage && m("div.flex-none.green", m("span", {onclick: () => statusMessage =""}, "✖ "), statusMessage),
                !chosenFileName && m("div.flex-none",
                    "file not specified in URL querystring"
                ),
                chosenFileName && !chosenFileLoaded && mboxContents === null && m("div.flex-none",
                    "Loading..."
                ),
                chosenFileName && chosenFileLoaded && viewEmailSearch(),
                chosenFileName && chosenFileLoaded && viewEmails()
            ),
            m("div.h-100.overflow-auto", 
                { style: { flex: "50%" }}, 
                lastSelectedEmail && m("div", viewEmailPart(lastSelectedEmail))
            )
        )
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) loadFileContents(filePathFromParams)

m.mount(document.body, ViewMail)
