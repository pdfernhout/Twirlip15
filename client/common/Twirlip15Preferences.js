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
