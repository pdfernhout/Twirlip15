import parse from "../../vendor/emailjs/mimeparser.js"

function rtrim(string) {
    // Trim trailing space from string
    return string.replace(/\s*$/,"")
}

let unknownIndex = 0

// eslint-disable-next-line no-unused-vars
export function parseEmailRoughAndReady(email) {
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

export function getFromField(message) {
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

export function getToField(message) {
    let to
    if (message.headers.newsgroup) {
        to = message.headers.newsgroup[0]
    } else if (message.headers.to) {
        to = message.headers.to[0]
    }
    if (!to) return null
    const address = to.value[0].address
    const name = to.value[0].name
    if (!address && name.includes(" at ") && to.initial.includes(")")) {
        const addressDerivedFromName = name.replace(" at ", "@")
        const nameInsideParens = to.initial.match(/\(([^)]*)\)/)[1]
        return nameInsideParens.trim() + " <" + addressDerivedFromName.trim() + ">"
    }
    return name + " <" + address + ">"
}

// Recursive
export function getTextPlain(message) {
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
export function logMimeParts(message, indent=4) {
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

export function getMimeLog() {
    return mimeLog
}

export function processEmail(text) {
    return parse(text)
}
