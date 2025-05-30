/* global m, Push */
/* eslint-disable no-console */

"use strict"

import { Twirlip15Preferences } from "../../common/Twirlip15Preferences.js"
import { FileUtils } from "../../common/FileUtils.js"
import * as FileUploader from "../../common/FileUploader.js"
import { UUID } from "../../common/UUID.js"
import { Toast } from "../../common/Toast.js"
import { ItemStoreUsingServerFiles } from "../../common/ItemStoreUsingServerFiles.js"

import { marked } from "../../vendor/marked.js"

// defines Push
import "../../vendor/push.js"

// defines m
import "../../vendor/mithril.js"

let chosenFileName = ""
let chosenFileNameShort = ""

function showError(error) {
    Toast.toast(error)
}

const preferences = new Twirlip15Preferences()

let sendNotifications = preferences.get("chat-sendNotifications", "false")

let userID = preferences.get("userID", "anonymous")
let chatText = ""
const messages = []
let editedChatMessageUUID = null
let editedChatMessageText = ""

// filterText is split into tags by spaces and used to filter by a logical "and" to include displayed items
let filterText = ""

// hideText is split into tags by spaces and used to filter by a logical "OR" to hide displayed items
let hideText = ""

let sortMessagesByContent = false

let messagesDiv = null

let messagesByUUID = {}

let entryAreaPosition = preferences.get("chat-entryAreaPosition", "bottom")
const entryAreaPositionChoices = ["none", "right", "bottom", "top", "left"]

let isPrinting = false
window.addEventListener("beforeprint", (event) => {
    isPrinting = true
    m.redraw()
})
window.addEventListener("afterprint", (event) => {
    isPrinting = false
    m.redraw()
})

function userIDChange(event) {
    userID = event.target.value
    preferences.set("userID", userID)
}

function chatTextChange(event) {
    chatText = event.target.value
}

function sendChatMessage() {
    const timestamp = new Date().toISOString()
    const uuid = UUID.forType("chatMessage")

    const newMessage = { chatText, userID, timestamp, uuid }

    sendMessage({ chatText, userID, timestamp, uuid })
    chatText = ""
    if (!hasFilterText(newMessage)) {
        Toast.toast("The message you just added is currently\nnot displayed due to show/hide filtering.")
        /*
        filterText = ""
        hideText = "
        */
    }
    setTimeout(() => {
        // Scroll to bottom always when sending -- but defer it just in case was filtering
        if (messagesDiv) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight
        }
    }, 0)
}

function sendMessage(message) {
    // Call addItem after a delay to give socket.io a chance to reconnect
    // as socket.io will timeout if a prompt (or alert?) is up for very long
    chatRoomResponder.onAddItem(message, true)
    setTimeout(() => backend.addItem(message), 10)
}

function sendEditedChatMessage() {
    const timestamp = new Date().toISOString()
    const uuid = editedChatMessageUUID

    sendMessage({ chatText: editedChatMessageText, userID, timestamp, uuid })
    editedChatMessageUUID = null
    editedChatMessageText = ""
}

function sendIfCtrlEnter(event, text, callbackToSendMessage) {
    if (text.trim() && event.key === "Enter" && event.ctrlKey ) {
        callbackToSendMessage()
        return false
    }
    event.redraw = false
    return true
}

function editedChatMessageKeyDown(event) {
    return sendIfCtrlEnter(event, editedChatMessageText, sendEditedChatMessage)
}

function textAreaKeyDown(event) {
    return sendIfCtrlEnter(event, chatText, sendChatMessage)
}

function formatChatMessage(text) {
    return m.trust(marked(text))
}

function getSortedMessages() {
    if (!sortMessagesByContent) return messages
    const sortedMessages = messages.slice()
    sortedMessages.sort((a, b) => {
        if (a.chatText < b.chatText) return -1
        if (a.chatText > b.chatText) return 1
        return 0
    })
    return sortedMessages
}

function hasFilterText(message) {
    if (message.chatText === "DELETED" && filterText !== "DELETED") return false
    const localMessageTimestamp = makeLocalMessageTimestamp(message.timestamp)
    if ((filterText || hideText) && typeof message.chatText === "string") {
        let lowerCaseText = message.chatText.toLowerCase() + " " + ("" + message.userID).toLowerCase() + " " + localMessageTimestamp.toLowerCase()

        if (filterText) {
            const tags = filterText.split(" ")
            for (let tag of tags) {
                if (tag && !lowerCaseText.includes(tag.toLowerCase())) return false
            }
        }
        if (hideText) {
            const tags = hideText.split(" ")
            for (let tag of tags) {
                if (tag && lowerCaseText.includes(tag.toLowerCase())) return false
            }
        }
    }

    return true
}

function exportChatAsMarkdownClicked() {
    let text = ""

    getSortedMessages().forEach(function (message) {
        if (!hasFilterText(message)) return
        text += "\n----\n"
        text += "author: " + message.userID + " " + makeLocalMessageTimestamp(message.timestamp) + "\n"
        text += message.editedTimestamp ? "last edited: " + makeLocalMessageTimestamp(message.editedTimestamp) + "\n": ""
        text += "\n"
        text += message.chatText
    })

    FileUtils.saveToFile(chosenFileNameShort + " " + new Date().toISOString(), text, ".md")
}

function exportChatAsJSONClicked() {
    const messagesToExport = []

    getSortedMessages().forEach(function (message) {
        if (!hasFilterText(message)) return
        messagesToExport.push(message)
    })
    
    const exportString = messagesToExport.map(message => JSON.stringify(message, (key, value) => {
        if (key === "editedTimestamp") return undefined
        return value
    })).join("\n") + "\n"

    FileUtils.saveToFile("exported-chat-" + new Date().toISOString().replace(/:/g, "-"), exportString, ".twirlip-chat.jsonl")
}

function importChatFromJSONClicked() {
    FileUtils.loadFromFile(false, async (filename, contents, bytes) => {
        console.log("importing JSONL from filename", filename)
        const messages = bytes.split("\n").slice(0, -1).map(JSON.parse)
        for (let message of messages) {
            const previousVersion = messagesByUUID[message.uuid]
            if (previousVersion !== undefined) {
                if (previousVersion.uuid !== message.uuid) {
                    console.log("uuid mismatch")
                }
                let ignore = false
                for (let version = previousVersion; version; version = version.previousVersion) {
                    if (version.timestamp === message.timestamp) {
                        // ignore repeat of existing message
                        ignore = true
                        console.log("already have message", message.uuid)
                    }
                }
                if (!ignore && previousVersion.timestamp < message.timestamp) {
                    // only add if later
                    console.log("adding later message version", previousVersion, message)
                    await backend.addItem(message)
                }
            } else {
                console.log("adding new message", message)
                await backend.addItem(message)
            }
        }
    })
}

let isUploading = false

function getPathForFileName(filePath) {
    let lastSeparatorIndex = filePath.lastIndexOf("/")
    if (lastSeparatorIndex === -1) {
        lastSeparatorIndex =  filePath.lastIndexOf("\\")
    }
    if (lastSeparatorIndex === -1) {
        return "/"
    }
    return filePath.substring(0, lastSeparatorIndex + 1)
}

function uploadDocumentClicked() {
    FileUtils.loadFromFile(true, async (fileName, base64Contents) => {
        // console.log("loadFromFile result", filename, contents, bytes)
        isUploading = true
        m.redraw()

        const uploadDirectoryPath = getPathForFileName(chosenFileName) + "uploads/"

        if (!await FileUploader.doesFileExist(backend.twirlipServer, uploadDirectoryPath)) {
            // Make upload directory if needed
            const apiResult = await backend.twirlipServer.fileNewDirectory(uploadDirectoryPath)
            if (!apiResult) {
                Toast.toast("Could not create upload directory")
                return
            }
        }

        let uploadResult
        try {
            uploadResult = await FileUploader.uploadFileFromBase64Contents(backend.twirlipServer, base64Contents, uploadDirectoryPath, fileName)
            if (!uploadResult) {
                Toast.toast("Upload failed")
                return
            }
        } catch (error) {
            console.log("upload error", error)
            isUploading = false
            Toast.toast("Upload failed")
            return
        } finally {
            isUploading = false
        }
        
        const url = "uploads/" + fileName.replaceAll(" ", "&#32;")
        let textToAdd = `[${fileName}](${url})`
        // Format as markdown image if it might be an image
        if (uploadResult.isImageFile) textToAdd = `![${fileName}](${url} "${fileName}")`

        if (chatText) chatText += ""
        chatText += textToAdd

        if (uploadResult.existed) {
            Toast.toast("Upload already existed")
        } else {
            Toast.toast("Uploaded " + uploadResult.filename)
        }

        m.redraw()
    })
}

function makeLocalMessageTimestamp(timestamp) {
    // Derived from: https://stackoverflow.com/questions/17415579/how-to-iso-8601-format-a-date-with-timezone-offset-in-javascript
    const date = new Date(Date.parse(timestamp))
    // const tzo = -date.getTimezoneOffset()
    // const dif = tzo >= 0 ? "+" : "-"
    const pad = function(num) {
        var norm = Math.floor(Math.abs(num))
        return (norm < 10 ? "0" : "") + norm
    }
    return date.getFullYear() +
        "-" + pad(date.getMonth() + 1) +
        "-" + pad(date.getDate()) +
        " " + pad(date.getHours()) +
        ":" + pad(date.getMinutes()) +
        ":" + pad(date.getSeconds())
    // + dif + pad(tzo / 60) +
    // ":" + pad(tzo % 60)
}

function viewNavigation() {
    return [
        m("span.dib.tr.ml2", "User:"),
        m("input.w4.ml2", {value: userID, oninput: userIDChange, title: "Your user id or handle"}),
        m("div.dib",
            m("span.ml2" + (filterText ? ".green" : ""), "Show:"),
            m("input.ml2" + (filterText ? ".green" : ""), {value: filterText, oninput: (event) => { filterText = event.target.value; scrollToBottomLater() }, title: "Only display messages with all entered words"}),
            m("span.ml2" + (hideText ? ".orange" : ""), "Hide:"),
            m("input.ml2" + (hideText ? ".orange" : ""), {value: hideText, oninput: (event) => { hideText = event.target.value; scrollToBottomLater() }, title: "Hide messages with any entered words"}),
            m("label.ml2.nowrap",  { title: "Sort alphabetically by chat message text" },
                m("input[type=checkbox].ma1", { checked: sortMessagesByContent, onchange: (event) => sortMessagesByContent = event.target.checked }),
                "sort"
            )
        ),
    ]
}

function viewMessages() {
    return getSortedMessages().map(function (message) {
        if (!hasFilterText(message)) return []
        return m("div", /* Causes ordering issue: {key: message.uuid || ("" + index)}, */ [
            m("hr.b--light-gray"),
            m("span",
                m("i", makeLocalMessageTimestamp(message.timestamp) + " " + message.userID),
                (message.previousVersion)
                    ? m("span.ml2", {
                        title: "show history in console",
                        onclick: () => {
                            let messageVersion = message
                            while (messageVersion) {
                                console.log("messageVersion", messageVersion)
                                messageVersion = messageVersion.previousVersion
                            }
                            Toast.toast("History of message put in console")
                        }}, "⌚")
                    : [],
                message.editedTimestamp ? m("b.ml1", {title: makeLocalMessageTimestamp(message.editedTimestamp) }, "edited")  : [],
                // support editing
                (message.userID === userID && message.uuid)
                    ? m("span.ml2", {
                        title: "edit",
                        onclick: () => {
                            if (editedChatMessageUUID === message.uuid) {
                                editedChatMessageUUID = null
                            } else {
                                editedChatMessageUUID = message.uuid || null
                                editedChatMessageText = message.chatText
                            }
                        }}, "✎")
                    : []),
            editedChatMessageUUID === message.uuid
                // if editing
                ? m("div.ba.bw1.ma3.ml4.pa3",
                    m("textarea.h5.w-80.ma2.ml3.f4", {value: editedChatMessageText, onkeydown: editedChatMessageKeyDown, oninput: (event) => editedChatMessageText = event.target.value}),
                    m("div",
                        m("button.ml2.mt2", {onclick: () => sendEditedChatMessage() }, "Update (ctrl-enter)"),
                        m("button.ml2.mt2", {onclick: () => editedChatMessageUUID = null}, "Cancel"),
                    ),
                )
                : m(".pl4.pr4", formatChatMessage(message.chatText))
        ])
    })
}

function viewEntryAreaPositionChoice() {
    return m("span.ml2",  { title: "Show entry area" },
        m("select", {onchange: event => {
                entryAreaPosition = event.target.value
                preferences.set("chat-entryAreaPosition", entryAreaPosition)
            }},
            entryAreaPositionChoices.map(key => {
                return m("option", {value: key, selected: entryAreaPosition === key}, "entry area: " + key)
            })
        )
    )
}

function viewEntryLine() {
    return m("div",
        viewEntryAreaPositionChoice(),
        m("span.w-80", 
            m("input.ml2.w-70", {value: chatText, oninput: chatTextChange, onkeydown: textAreaKeyDown}),
            m("button.ml2.mt2.w-10", {onclick: sendChatMessage, title: "Ctrl-Enter to send"}, "Send"),
        )
    )
}

function viewSetNotifications() {
    const isDenied = Notification.permission === "denied"
    return m("label.ml2.nowrap" + (isDenied ? ".moon-gray" : ""),  
        { title: "Send notifications and poll in background" + 
            (isDenied ? 
                "\nif this is greyed out check your browser notification settings for this website"
                : ""
            )
        },
        m("input[type=checkbox].ma1", { 
            checked: Push.Permission.has() && sendNotifications === "true", 
            onchange: event => {
                if (!Push.Permission.has()) Push.Permission.request(
                    () => {
                        sendNotifications = "true"
                        m.redraw()
                    }, 
                    m.redraw
                )
                event.target.checked
                    ? sendNotifications = "true"
                    : sendNotifications = "false"
                    preferences.set("chat-sendNotifications", sendNotifications)
            },
            disabled: isDenied
        }),
        "notify"
    )  
}
function viewEntryAreaTools() {
    return m("div.dib",
        viewEntryAreaPositionChoice(),
        viewSetNotifications(),
        m("a.pl2", {href: "https://github.github.com/gfm/", target: "_blank"}, "Markdown"),
        m("a.pl2", {href: "https://unpkg.com/svgedit@7.1.3/dist/editor/index.html", target: "_blank"}, "SVGEdit"),
        m("button.ml2.mt2", {onclick: sendChatMessage}, "Send (ctrl-enter)"),
        m("button.ml2.mt2", {onclick: uploadDocumentClicked}, m("i.fa.mr1" + (isUploading ? ".fa-refresh.fa-spin" : ".fa-upload")), "Upload document..."),
        m("button.ml2.mt2", {onclick: exportChatAsMarkdownClicked, title: "Export filtered chat as Markdown"}, "Export Markdown..."),
        m("button.ml2.mt2", {onclick: exportChatAsJSONClicked, title: "Export filtered chat as JSONL"}, "Export JSONL..."),
        m("button.ml2.mt2", {onclick: importChatFromJSONClicked, title: "Import chat messages from JSONL"}, "Import JSONL..."),
    )
}

function viewEntryArea() {
    return m("div.pb1.f4" + (editedChatMessageUUID ? ".dn" : ""),
        m("textarea.h4.w-80.ma1.ml2", {value: chatText, oninput: chatTextChange, onkeydown: textAreaKeyDown}),
    )
}

const TwirlipChat = {
    view: function () {
        return m("div.flex.flex-row.h-100.w-100",
            (entryAreaPosition === "left") && m("div.ma2",
                viewEntryAreaTools(),
                viewEntryArea()
            ),
            m("div.pa2" + (isPrinting ? "" : ".overflow-hidden") + ".flex.flex-column.h-100.w-100", [
                Toast.viewToast(),
                m("div.mb3",
                    viewNavigation()
                ),
                !isPrinting && (entryAreaPosition === "top") && viewEntryAreaTools(),                  
                !isPrinting && (entryAreaPosition === "top") && viewEntryArea(),
                m("div" + (isPrinting ? "" : ".overflow-auto") + ".flex-auto",
                    {
                        oncreate: (vnode) => {
                            messagesDiv = (vnode.dom)
                        },
                    },
                    viewMessages(),
                ),
                !isPrinting && (entryAreaPosition === "none") && viewEntryLine(),
                !isPrinting && (entryAreaPosition === "bottom") && viewEntryAreaTools(),                  
                !isPrinting && (entryAreaPosition === "bottom") && viewEntryArea()
            ]),
            (entryAreaPosition === "right") && m("div.ma2",
                viewEntryAreaTools(),
                viewEntryArea()
            )
        )
    }
}

let isLoaded = false

function scrollToBottomLater() {
    setTimeout(() => {
        // Scroll to bottom when loaded everything
        if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight + 10000
    }, 0)
}

const chatRoomResponder = {

    onLoaded: () => {
        if (!isLoaded) scrollToBottomLater()
        isLoaded = true
    },

    onAddItem: (item, localChange) => {
        let edited = false
        // Complexity needed to support editing
        const previousVersion = messagesByUUID[item.uuid]
        if (previousVersion === undefined) {
            if (item.uuid !== undefined) messagesByUUID[item.uuid] = item
            messages.push(item)
        } else {
            for (let version = previousVersion; version; version = version.previousVersion) {
                if (version.timestamp === item.timestamp && version.editedTimestamp === item.editedTimestamp) {
                    // ignore repeat of existing message
                    return
                }
            }
            // console.log("message is edited", item, messagesByUUID[item.uuid])
            item.editedTimestamp = item.timestamp
            item.timestamp = previousVersion.timestamp
            messagesByUUID[item.uuid] = item
            const index = messages.indexOf(previousVersion)
            messages[index] = item
            edited = true
            item.previousVersion = previousVersion
        }
        const itemIsNotFiltered = hasFilterText(item)
        if (!localChange && isLoaded) {
            // Only scroll if scroll is already near bottom and not filtering or editing to avoid messing up editing or browsing previous items
            if (itemIsNotFiltered && !edited && messagesDiv && (item.userID === userID || messagesDiv.scrollTop >= (messagesDiv.scrollHeight - messagesDiv.clientHeight - 300))) {
                setTimeout(() => {
                    // Add some because height may not include new item
                    messagesDiv.scrollTop = messagesDiv.scrollHeight + 10000
                }, 100)
            }
            if (sendNotifications === "true" && Push.Permission.has() && !document.hasFocus()) {
                // Notify the user about a new message in this window
                Push.create(item.userID + ": " + item.chatText, {timeout: 4000})
            }
        }
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) {
    chosenFileName = filePathFromParams
    chosenFileNameShort = filePathFromParams.split("/").pop()
}

const backend = ItemStoreUsingServerFiles(showError, m.redraw, chatRoomResponder, chosenFileName, () => Toast.toast("loading chat file failed"))

m.mount(document.body, TwirlipChat)
