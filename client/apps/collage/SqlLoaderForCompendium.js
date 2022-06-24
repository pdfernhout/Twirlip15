import { SqlUtils } from "./SqlUtils.js"

/* global m */

// TODO: Generify to load any Compendium SQL dump file

let compendiumFeatureSuggestionsTables = null
let loadingPromise = null

async function _loadCompendiumFeatureSuggestions() {
    const url = import.meta.url
    const baseDir = url.substring(0, url.lastIndexOf("/"))
    const response = await fetch(baseDir + "/feature_suggestions_compendium_map.sql")
    const fileContents = await response.text()
    compendiumFeatureSuggestionsTables = SqlUtils.parseSqlIntoTables(fileContents)
    m.redraw()
    return fileContents
}

function loadCompendiumFeatureSuggestions() {
    if (!loadingPromise) loadingPromise = _loadCompendiumFeatureSuggestions()
    return loadingPromise
}

function importNodeTable(t, nodeTable) {
    // console.log("nodeTable", nodeTable)
    for (let node of nodeTable) {
        const id = "collageNode|" + node.NodeID
        for (let fieldName of [
            "Author",
            "CreationDate",
            "CurrentStatus",
            "Detail",
            "ExtendedNodeType",
            "Label",
            "LastModAuthor",
            "ModificationDate",
            "NodeID",
            "NodeType",
            "OriginalID"
        ]) {
            let value = node[fieldName]
            let fieldType = undefined
            if (fieldName.endsWith("ID")) value = "collageNode|" + value
            else if (fieldName.endsWith("Date")) {
                value = new Date(value).toISOString()
                fieldType = "date"
            }
            else if (fieldName === "Detail") value = value.replace(/\\n/g, "\n")
            const fieldNameAdjusted = fieldName.charAt(0).toLowerCase() + fieldName.substring(1)
            t.addTripleABC(id, fieldNameAdjusted, value, fieldType)
        }
        const typeName = {
            0: "General",

            1: "List",
            2: "Map",
            3: "Issue",
            4: "Position",
            5: "Argument",
            6: "Pro",
            7: "Con",
            8: "Decision",
            9: "Reference",
            10: "Note",

            11: "ListShortcut",
            12: "MapShortcut",
            13: "IssueShortcut",
            14: "PositionShortcut",
            15: "ArgumentShortcut",
            16: "ProShortcut",
            17: "ConShortcut",
            18: "DecisionShortcut",
            19: "ReferenceShortcut",
            20: "NoteShortcut",

            21: "PlannerMap",
            22: "MovieMap",
            31: "PlannerMapShortcut",
            32: "MovieMapShortcut",

            // trashbin and inbox are system nodes with only one instance
            51: "Trashbin",
            52: "Inbox",
        }[node.NodeType]
        t.addTripleABC(id, "type", typeName, "collageNodeType")
    }
}

function importViewNodeTable(t, viewNodeTable) {
    // console.log("viewNodeTable", viewNodeTable)
    for (let row of viewNodeTable) {
        const id = "collageNode|" + row.ViewID
        const modifiedRow = {}
        for (let fieldName of [
            "Background",
            "CreationDate",
            "CurrentStatus",
            "FontFace",
            "FontSize",
            "FontStyle",
            "Foreground",
            "HideIcon",
            "LabelWrapWidth",
            "ModificationDate",
            "NodeID",
            "ShowTags",
            "ShowText",
            "ShowTrans",
            "ShowWeight",
            "SmallIcon",
            "ViewID",
            "XPos",
            "YPos"
        ]) {
            let value = row[fieldName]
            if (fieldName.endsWith("ID")) value = "collageNode|" + value
            else if (fieldName.endsWith("Date")) {
                value = new Date(value).toISOString()
                row[fieldName] = value
            }
            const fieldNameAdjusted = fieldName.charAt(0).toLowerCase() + fieldName.substring(1)
            modifiedRow[fieldNameAdjusted] = value
        }
        modifiedRow.id = modifiedRow.nodeID
        // console.log("adding for ", modifiedRow.id, {contains: modifiedRow.id})
        // TODO: Make this into a nested triple-defined object
        t.addTriple({a: id, b: "contains", c: JSON.stringify(modifiedRow), ct: "json", o: "insert"})
    }
}

const linkTypeNumberToName = {
    39: "RespondsTo",
    40: "Supports",
    41: "ObjectsTo",
    42: "Challenges",
    43: "Specializes",
    44: "ExpandsOn",
    45: "RelatedTo",
    46: "About"
}

function importLinkTable(t, linkTable) {
    // console.log("linkTable", linkTable)
    for (let link of linkTable) {
        const id = "collageNode|" + link.LinkID
        for (let fieldName of [
            "Author",
            "CreationDate",
            "CurrentStatus",
            "FromNode",
            "Label",
            "LinkID",
            "LinkType",
            "ModificationDate",
            "OriginalID",
            "ToNode"
        ]) {
            let value = link[fieldName]
            let fieldType = undefined
            if (fieldName.endsWith("ID")) value = "collageNode|" + value
            else if (fieldName.endsWith("Node")) value = "collageNode|" + value
            else if (fieldName.endsWith("Date")) {
                value = new Date(value).toISOString()
                fieldType = "date"
            } else if (fieldName === "LinkType") {
                value = linkTypeNumberToName[value] || "RespondsTo"
                fieldType = "collageLinkType"
            }
            const fieldNameAdjusted = fieldName.charAt(0).toLowerCase() + fieldName.substring(1)
            t.addTripleABC(id, fieldNameAdjusted, value, fieldType)
        }
        t.addTripleABC(id, "type", "Link", "collageNodeType")
    }
}
     
function importViewLinkTable(t, viewLinkTable) {
    // console.log("viewLinkTable", viewLinkTable)
    for (let row of viewLinkTable) {
        const id = "collageNode|" + row.ViewID
        const modifiedRow = {}
        for (let fieldName of [
            "ArrowType",
            "Background",
            "CreationDate",
            "CurrentStatus",
            "FontFace",
            "FontSize",
            "FontStyle",
            "Foreground",
            "LabelWrapWidth",
            "LinkColour",
            "LinkDashed",
            "LinkID",
            "LinkStyle",
            "LinkWeight",
            "ModificationDate",
            "ViewID"
        ]) {
            let value = row[fieldName]
            if (fieldName.endsWith("ID")) value = "collageNode|" + value
            else if (fieldName.endsWith("Date")) {
                value = new Date(value).toISOString()
                row[fieldName] = value
            }
            const fieldNameAdjusted = fieldName.charAt(0).toLowerCase() + fieldName.substring(1)
            modifiedRow[fieldNameAdjusted] = value
        }
        modifiedRow.id = modifiedRow.linkID
        // TODO: Maybe "hasLink" should be "contains" with some way to distinguish links from other items?
        // TODO: Make this into a nested triple-defined object
        t.addTriple({a: id, b: "hasLink", c: JSON.stringify(modifiedRow), ct: "json", o: "insert"})
    }
}

// parameter p is expected to be a Pointrel triple store
async function importFeatureSuggestions(p) {
    if (!confirm("Import feature suggestions?\n(This adds a lot of data.)")) return false
    await loadCompendiumFeatureSuggestions()
    // console.log("compendiumFeatureSuggestionsTables", compendiumFeatureSuggestionsTables)
    const nodeTable = compendiumFeatureSuggestionsTables["Node"]
    importNodeTable(p, nodeTable)
    const viewNodeTable = compendiumFeatureSuggestionsTables["ViewNode"]
    importViewNodeTable(p, viewNodeTable)
    const linkTable = compendiumFeatureSuggestionsTables["Link"]
    importLinkTable(p, linkTable)
    const viewLinkTable = compendiumFeatureSuggestionsTables["ViewLink"]
    importViewLinkTable(p, viewLinkTable)
    return true
}

export const SqlLoaderForCompendium = {
    getCompendiumFeatureSuggestionsTables: () => compendiumFeatureSuggestionsTables,
    loadCompendiumFeatureSuggestions,
    importFeatureSuggestions
}
