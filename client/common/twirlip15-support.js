/* global m */

export async function twirlip15ApiCall(request, onerror) {
    if (!onerror) {
        onerror = errorMessage => { throw new Error(errorMessage) }
    }
    let result = null
    try {
        const response = await fetch("/twirlip15-api", {
            method: "POST",
            headers: {
            "Content-Type": "application/json;charset=utf-8"
            },
            body: JSON.stringify(request)
        })
        if (response.ok) {
            const json = await response.json()
            if (json.ok) {
                result = json
            } else {
                onerror(json.errorMessage)
            }   
        } else {
            console.log("HTTP-Error: " + response.status, response)
            onerror("API request failed for file contents: " + response.status)
        }
    } catch (error) {
        console.log("api call error", error)
        onerror("API call error; see console for details")
    }
    setTimeout(() => m.redraw(), 0)
    return result
}

const preferencesBaseStorageKey = "twirlip15-preference--"

export class Twirlip15Preferences {

    get(preferenceName, defaultValue) {
        const valueAsString = localStorage.getItem(preferencesBaseStorageKey + preferenceName) 
        if (valueAsString === null) return defaultValue
        try {
            return JSON.parse(valueAsString)
        } catch {
            return defaultValue
        }
    }

    set(preferenceName, newValue) {
        localStorage.setItem(preferencesBaseStorageKey + preferenceName, JSON.stringify(newValue))
        return newValue
    }

    isPreferenceStorageEvent(event) {
        return event.key && event.key.startsWith(preferencesBaseStorageKey)
    }

}

export const menuHoverColor = ".hover-bg-orange"

export function menuTopBar(parts) {
    return m("div.ma1.ml4.bg-light-green", parts)
}

export function menuButton(label, action, disabled) {
    return m("span.dib.pa2" + menuHoverColor + (disabled ? ".disabled-button" : ""), {
        onclick: action, 
    }, label)
}

export function menuCheckbox(label, checked, action, disabled) {
    return m("label.dib.pa2" + menuHoverColor + (disabled ? ".disabled-button" : ""), 
        m("input[type=checkbox].mr1", {
            checked: checked,
            onclick: action
        }),
        label
    )
}
