async function test() {
    const response = await fetch("/twirlip15-api/hello")
    if (response.ok) { // if HTTP-status is 200-299
        // get the response body (the method explained below)
        const json = await response.json()
        console.log("response", response)
        document.body.appendChild(document.createElement("br"))
        document.body.appendChild(document.createTextNode("Test response: " + json.data))    
    } else {
        alert("HTTP-Error: " + response.status)
    }
}

test()
