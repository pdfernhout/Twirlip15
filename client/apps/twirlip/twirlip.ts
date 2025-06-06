// @ts-ignore
import { Twirlip15Preferences } from "../../common/Twirlip15Preferences.js"
// @ts-ignore
import { Toast } from "../../common/Toast.js"
// @ts-ignore
import { ItemStoreUsingServerFiles } from "../../common/ItemStoreUsingServerFiles.js"

// defines Push
import "../../vendor/push.js"

// defines m
declare const m: any
import "../../vendor/mithril.js"

let chosenFileName = ""
let chosenFileNameShort = ""

function showError(error: string) {
    Toast.toast(error)
}

const preferences = new Twirlip15Preferences()

let userID = preferences.get("userID", "anonymous")

type Message = {
    uuid: string
    type: string
    user: string
    timestamp: string
    previous: string
}

const messages: Message[] = []

let messagesByUUID: { [uuid: string]: Message } = {}

let isPrinting = false
window.addEventListener("beforeprint", (event) => {
    isPrinting = true
    m.redraw()
})
window.addEventListener("afterprint", (event) => {
    isPrinting = false
    m.redraw()
})

// function sendMessage(message) {
//     // Call addItem after a delay to give socket.io a chance to reconnect
//     // as socket.io will timeout if a prompt (or alert?) is up for very long
//     twirlipStreamResponder.onAddItem(message, true)
//     setTimeout(() => backend.addItem(message), 10)
// }

const TwirlipApp = {
    view: function () {
        return m("div.flex.flex-row.h-100.w-100",
            m("div.pa2" + (isPrinting ? "" : ".overflow-hidden") + ".flex.flex-column.h-100.w-100",
                Toast.viewToast(),
                m("div", "Work in progress")
            )
        )
    }
}

let isLoaded = false

const twirlipStreamResponder = {

    onLoaded: () => {
        isLoaded = true
    },

    onAddItem: (item: Message) => {
        // ignore duplicate messages or improperly-formed ones
        if (item.uuid !== undefined) {
            messagesByUUID[item.uuid] = item
            messages.push(item)
        }
    }
}

const filePathFromParams = decodeURI(window.location.pathname)

if (filePathFromParams) {
    chosenFileName = filePathFromParams
    chosenFileNameShort = filePathFromParams.split("/").pop() || "Twirlip"
}

const backend = ItemStoreUsingServerFiles(showError, m.redraw, twirlipStreamResponder, chosenFileName, () => Toast.toast("loading twirlip file failed"))

m.mount(document.body, TwirlipApp)
