// HashUUIDTracker -- ensures consistency between UUID in URL hash, application, and page title

"use strict"

/* global m */

import { HashUtils } from "./HashUtils.js"

export function HashUUIDTracker(uuidNameInHash = "uuid", onUUIDChangedCallback = null, updateTitleCallback = null, suggestedUUDIfNoneInHash = null) {

    console.log("HashUUIDTracker", uuidNameInHash, suggestedUUDIfNoneInHash)
    let uuid

    function getUUID() {
        return uuid
    }

    function startup() {
        const hashParams = HashUtils.getHashParams()
        let newUUID = hashParams[uuidNameInHash]
        if (!newUUID) {
            if (suggestedUUDIfNoneInHash) {
                newUUID = suggestedUUDIfNoneInHash
                uuidChangedByApp(newUUID, true)
            }
        } else {
            updateTitleForUUID()
        }
        uuid = newUUID
        window.onhashchange = () => onUUIDChangedFromHash()
    }

    function onUUIDChangedFromHash() {
        const hashParams = HashUtils.getHashParams()
        const newUUID = hashParams[uuidNameInHash]
        if (newUUID !== uuid) {
            uuid = newUUID
            updateTitleForUUID()
            if (onUUIDChangedCallback) onUUIDChangedCallback(uuid)
            m.redraw()
        }
    }

    function uuidChangedByApp(newUUID, useReplaceState=false) {
        if (uuid !== newUUID) {
            uuid = newUUID
            const hashParams = HashUtils.getHashParams()
            hashParams[uuidNameInHash] = newUUID
            HashUtils.setHashParams(hashParams, useReplaceState)
            updateTitleForUUID()
        }
    }

    function updateTitleForUUID() {
        if (updateTitleCallback) return updateTitleCallback()
        const title = document.title.split(" -- ")[0]
        document.title = title + " -- " + uuid
    }

    startup()

    return {
        getUUID,
        uuidChangedByApp
    }

}