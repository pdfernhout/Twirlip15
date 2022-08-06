// Pointrel-like ideas inspired a bit by "Foam"
// https://news.ycombinator.com/item?id=23666950
// https://github.com/foambubble/foam
// Successor to ideas app

/* global m */
import "../../vendor/mithril.js"

import { Twirlip15ServerAPI } from "../../common/twirlip15-api.js"
// import { expander } from "../../common/menu.js"

import { ObjectStore } from "../../common/ObjectStore.js"

const twirlipServer = new Twirlip15ServerAPI(error => console.log(error))

let directoryPath
let o

function loadDirectory() {
    console.log("directoryPath", directoryPath)
    o = ObjectStore(() => m.redraw(), twirlipServer, directoryPath)
}

let newConcept = ""

const Notes = {
    view: () => {
        return m("div.h-100.w-100",
            (o("concepts", "concept") || []).map(concept => m("div", m("b", concept))),
            m("br"),
            m("input", { value: newConcept, oninput: event => newConcept = event.target.value}),
            m("button", { onclick: () => { o("concepts", "concept", newConcept, "insert"); newConcept = "" }}, "Add concept")
        )
    }
}

function startup() {
    directoryPath =  decodeURI(window.location.pathname)
    loadDirectory()
    m.mount(document.body, Notes)
}

startup()
