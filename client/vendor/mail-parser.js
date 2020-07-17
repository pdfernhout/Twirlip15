// Derived from mail-parser.js MIT license
// https://github.com/nodemailer/mailparser/blob/master/lib/mail-parser.js

import { addressparser } from "./addressparser.js"
import { punycode } from "./punycode.js"

export function MailParser() {

    // Stub for libmime
    const libmime = {
        decodeHeader(value) { return value },
        parseHeaderValue(value) { return value },
        decodeWords(value) { return value }
    }

    function processHeaders(lines) {
        let headers = new Map()
        if (!lines) lines = []
        lines.forEach(line => {
            let key = line.key
            let value = ((libmime.decodeHeader(line.line) || {}).value || "").toString().trim()
            // Unused right now with stub: value = Buffer.from(value, "binary").toString()
            switch (key) {
                case "content-type":
                case "content-disposition":
                case "dkim-signature":
                    value = libmime.parseHeaderValue(value)
                    if (value.value) {
                        value.value = libmime.decodeWords(value.value)
                    }
                    Object.keys((value && value.params) || {}).forEach(key => {
                        try {
                            value.params[key] = libmime.decodeWords(value.params[key])
                        } catch (E) {
                            // ignore, keep as is
                        }
                    })
                    break
                case "date":
                    value = new Date(value)
                    if (!value || value.toString() === "Invalid Date" || !value.getTime()) {
                        // date parsing failed :S
                        value = new Date()
                    }
                    break
                case "subject":
                    try {
                        value = libmime.decodeWords(value)
                    } catch (E) {
                        // ignore, keep as is
                    }
                    break
                case "references":
                    try {
                        value = libmime.decodeWords(value)
                    } catch (E) {
                        // ignore
                    }
                    value = value.split(/\s+/).map(ensureMessageIDFormat)
                    break
                case "message-id":
                case "in-reply-to":
                    try {
                        value = libmime.decodeWords(value)
                    } catch (E) {
                        // ignore
                    }
                    value = ensureMessageIDFormat(value)
                    break
                case "priority":
                case "x-priority":
                case "x-msmail-priority":
                case "importance":
                    key = "priority"
                    value = parsePriority(value)
                    break
                case "from":
                case "to":
                case "cc":
                case "bcc":
                case "sender":
                case "reply-to":
                case "delivered-to":
                case "return-path":
                    value = addressparser(value)
                    decodeAddresses(value)
                    /*
                    value = {
                        value,
                        html: getAddressesHTML(value),
                        text: getAddressesText(value)
                    }
                    */
                    break
            }

            // handle list-* keys
            if (key.substr(0, 5) === "list-") {
                value = parseListHeader(key.substr(5), value)
                key = "list"
            }

            if (value) {
                if (!headers.has(key)) {
                    headers.set(key, [].concat(value || []))
                } else if (Array.isArray(value)) {
                    headers.set(key, headers.get(key).concat(value))
                } else {
                    headers.get(key).push(value)
                }
            }
        })

        // keep only the first value
        let singleKeys = [
            "message-id",
            "content-id",
            "from",
            "sender",
            "in-reply-to",
            "reply-to",
            "subject",
            "date",
            "content-disposition",
            "content-type",
            "content-transfer-encoding",
            "priority",
            "mime-version",
            "content-description",
            "precedence",
            "errors-to"
        ]

        headers.forEach((value, key) => {
            if (Array.isArray(value)) {
                if (singleKeys.includes(key) && value.length) {
                    headers.set(key, value[value.length - 1])
                } else if (value.length === 1) {
                    headers.set(key, value[0])
                }
            }

            if (key === "list") {
                // normalize List-* headers
                let listValue = {}
                ;[].concat(value || []).forEach(val => {
                    Object.keys(val || {}).forEach(listKey => {
                        listValue[listKey] = val[listKey]
                    })
                })
                headers.set(key, listValue)
            }
        })

        return headers
    }

    function parseListHeader(key, value) {
        let addresses = addressparser(value)
        let response = {}
        let data = addresses
            .map(address => {
                if (/^https?:/i.test(address.name)) {
                    response.url = address.name
                } else if (address.name) {
                    response.name = address.name
                }
                if (/^mailto:/.test(address.address)) {
                    response.mail = address.address.substr(7)
                } else if (address.address && address.address.indexOf("@") < 0) {
                    response.id = address.address
                } else if (address.address) {
                    response.mail = address.address
                }
                if (Object.keys(response).length) {
                    return response
                }
                return false
            })
            .filter(address => address)
        if (data.length) {
            return {
                [key]: response
            }
        }
        return false
    }

    function parsePriority(value) {
        value = value.toLowerCase().trim()
        if (!isNaN(parseInt(value, 10))) {
            // support "X-Priority: 1 (Highest)"
            value = parseInt(value, 10) || 0
            if (value === 3) {
                return "normal"
            } else if (value > 3) {
                return "low"
            } else {
                return "high"
            }
        } else {
            switch (value) {
                case "non-urgent":
                case "low":
                    return "low"
                case "urgent":
                case "high":
                    return "high"
            }
        }
        return "normal"
    }

    function ensureMessageIDFormat(value) {
        if (!value.length) {
            return false
        }

        if (value.charAt(0) !== "<") {
            value = "<" + value
        }

        if (value.charAt(value.length - 1) !== ">") {
            value += ">"
        }

        return value
    }

    function decodeAddresses(addresses) {
        for (let i = 0; i < addresses.length; i++) {
            let address = addresses[i]
            address.name = (address.name || "").toString().trim()

            if (!address.address && /^(=\?([^?]+)\?[Bb]\?[^?]*\?=)(\s*=\?([^?]+)\?[Bb]\?[^?]*\?=)*$/.test(address.name)) {
                let parsed = addressparser(libmime.decodeWords(address.name))
                if (parsed.length) {
                    parsed.forEach(entry => addresses.push(entry))
                }

                // remove current element
                addresses.splice(i, 1)
                i--
                continue
            }

            if (address.name) {
                try {
                    address.name = libmime.decodeWords(address.name)
                } catch (E) {
                    //ignore, keep as is
                }
            }
            if (/@xn--/.test(address.address)) {
                address.address =
                    address.address.substr(0, address.address.lastIndexOf("@") + 1) +
                    punycode.toUnicode(address.address.substr(address.address.lastIndexOf("@") + 1))
            }
            if (address.group) {
                decodeAddresses(address.group)
            }
        }
    }

    return {
        processHeaders
    }

}