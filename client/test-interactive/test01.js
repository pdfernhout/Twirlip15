async function test() {
    const response = await fetch("/twirlip15-api")
    console.log("response", response)
    if (response.ok) { // if HTTP-status is 200-299
        // get the response body (the method explained below)
        const json = await response.json()
        console.log("json", json)
        document.body.appendChild(document.createElement("br"))
        document.body.appendChild(document.createTextNode("Server response:"))
        const preElement = document.createElement("pre")
        document.body.appendChild(preElement) 
        preElement.appendChild(document.createTextNode(JSON.stringify(json, null, 4)))
    } else {
        alert("HTTP-Error: " + response.status)
    }
}

test()
