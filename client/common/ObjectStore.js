import canonicalize from "../vendor/canonicalize.js"

export function ObjectStore(/* directoryPath */) {
    const objects = {}

    return function(a, b, c, mode="replace") {

        if (a && b && c) {
            // Set value
            const aString = canonicalize(a)
            const bString = canonicalize(b)
            const cString = canonicalize(c)
            if (!objects[aString]) objects[aString] = {}
            let isMulti = false
            if (mode === "insert" || mode === "remove" || mode === "clear") {
                isMulti = true
            }
            if (isMulti) {
                if (!objects[aString][bString]) objects[aString][bString] = []
                objects[aString][bString].push(cString)
            } else {
                objects[aString][bString] = cString
            }
            return objects[aString][bString]
        }

        if (a && b) {
            // get value
            const aString = canonicalize(a)
            if (!objects[aString]) return undefined
            const bString = canonicalize(b)
            const cValue = objects[aString][bString]
            if (typeof cValue === "string") return JSON.parse(cValue)
            return cValue.map(v => JSON.parse(v))
        }

        if (a) {
            // get entire object
            const aString = canonicalize(a)
            const internalObject = objects[aString]
            if (!internalObject) return undefined
            const object = {}
            for (const bString in internalObject) {
                let bAccessor = JSON.parse(bString)
                if (typeof bAccessor !== "string") {
                    // Kludge to make non-standard fields accessible
                    bAccessor = bString
                }
                const cValue = internalObject[bString]
                if (typeof cValue === "string") {
                    object[bAccessor] = JSON.parse(cValue)
                } else {
                    object[bAccessor] = cValue.map(v => JSON.parse(v))
                }
            }            
            return object
        }
        
        throw new Error("function parameters needed")
    }
}

