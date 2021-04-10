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
