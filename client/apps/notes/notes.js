// Pointrel-like ideas inspired a bit by "Foam"
// https://news.ycombinator.com/item?id=23666950
// https://github.com/foambubble/foam
// Successor to ideas app

/* global m */
import "../../vendor/mithril.js"

// import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
// import { expander } from "../../common/menu.js"

let directoryPath

function loadDirectory() {
    console.log("directoryPath", directoryPath)
}

const Notes = {
    view: () => {
        return m("div.flex.flex-row.h-100.w-100",
            m("div", "Hello world: ", directoryPath)
        )
    }
}

function startup() {
    directoryPath =  decodeURI(window.location.pathname)
    loadDirectory()
    m.mount(document.body, Notes)
}

startup()
