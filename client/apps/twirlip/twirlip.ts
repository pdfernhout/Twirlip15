// @ts-ignore
import { Twirlip15Preferences } from "../../common/Twirlip15Preferences.js"

// defines m
declare const m: any
import "../../vendor/mithril.js"

const preferences = new Twirlip15Preferences()
let userID = preferences.get("userID", "anonymous")

type UUID = string

type Triple = {
    uuid: UUID
    timestamp: string
    author: string
    entity: string
    attribute: string
    value: string
    valueContentType?: string
    valueContentTransferEncoding?: string
    previous: UUID
}

const triples: Triple[] = []
const triplesByUUID: { [uuid: string]: Triple } = {}

function lastUUID(): UUID {
    return triples.length > 0 ? triples[triples.length - 1].uuid : ""
}

let entityFromInput: string = ""
let attributeFromInput: string = ""
let valueFromInput: string = ""
let valueContentTypeFromInput: string = ""
let valueContentTransferEncodingFromInput: string = ""

let searchResults = [] as Triple[]

const TwirlipApp = {
    view: function () {
        return m("div.flex.flex-row.h-100.w-100",
            m("div.pa2.flex.flex-column.h-100.w-100",
                m("div", "author: " + userID),
                m("div", "Last uuid: " + lastUUID()),
                m("input", {
                    type: "text",
                    placeholder: "entity",
                    value: entityFromInput,
                    oninput: (e: any) => {
                        entityFromInput = e.target.value
                    }
                }),
                m("input", {
                    type: "text",
                    placeholder: "attribute",
                    value: attributeFromInput,
                    oninput: (e: any) => {
                        attributeFromInput = e.target.value
                    }
                }),
                m("input", {
                    type: "text",
                    placeholder: "value",
                    value: valueFromInput,
                    oninput: (e: any) => {
                        valueFromInput = e.target.value
                    }
                }),
                m("input", {
                    type: "text",
                    placeholder: "valueContentType",
                    value: valueContentTypeFromInput,
                    oninput: (e: any) => {
                        valueContentTypeFromInput = e.target.value
                    }
                }),
                m("input", {
                    type: "text",
                    placeholder: "valueContentTransferEncoding",
                    value: valueContentTransferEncodingFromInput,
                    oninput: (e: any) => {
                        valueContentTransferEncodingFromInput = e.target.value
                    }
                }),
                m("button", {
                    onclick: () => {
                        searchResults = []
                        const lastTriple = triples[triples.length - 1]
                        if (!lastTriple) {
                            alert("No triples available to search.")
                            return
                        }
                        const searchEntity = entityFromInput.trim().toLowerCase()
                        const searchAttribute = attributeFromInput.trim().toLowerCase()
                        const searchValue = valueFromInput.trim().toLowerCase()
                        let triple = lastTriple
                        while (triple) {
                            // TODO: Add code to prevent endless loop
                            if ((!searchEntity || triple.entity.toLowerCase().includes(searchEntity)) &&
                                (!searchAttribute || triple.attribute.toLowerCase().includes(searchAttribute)) &&
                                (!searchValue || triple.value.toLowerCase().includes(searchValue))
                            ) {
                                searchResults.push(triple)
                            }
                            triple = triplesByUUID[triple.previous]
                        }
                    }
                }, "Search Triple"),
                m("button", {
                    onclick: () => {
                        const newTriple: Triple = {
                            uuid: crypto.randomUUID(),
                            timestamp: new Date().toISOString(),
                            author: userID,
                            entity: entityFromInput,
                            attribute: attributeFromInput,
                            value: valueFromInput,
                            valueContentType: valueContentTypeFromInput ? valueContentTypeFromInput : undefined,
                            valueContentTransferEncoding: valueContentTransferEncodingFromInput ? valueContentTypeFromInput : undefined,
                            previous: lastUUID()
                        }
                        triples.push(newTriple)
                        triplesByUUID[newTriple.uuid] = newTriple
                        entityFromInput = ""
                        attributeFromInput = ""
                        valueFromInput = ""
                        valueContentTypeFromInput = ""
                    }
                }, "Add Triple"),
                m("div.mt2", "Triples:", searchResults.length ? "[Found]" : "[All]"),
                m("ul",
                    ((searchResults.length && searchResults) || triples).slice().reverse().map((triple: Triple) =>
                        m("li", { key: triple.uuid },
                            JSON.stringify(triple, null, 2)
                        )
                    )
                )
            )
        )
    }
}

m.mount(document.body, TwirlipApp)
