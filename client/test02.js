async function test() {
    const response = await fetch("/twirlip15-api/file-contents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify({fileName: "/server/twirlip15.js"})
    })
    document.body.appendChild(document.createElement("br"))
    if (response.ok) {
        const json = await response.json()
        console.log("response", response)
        if (json.ok) {
            const preElement = document.createElement("pre")
            document.body.appendChild(preElement)
            preElement.appendChild(document.createTextNode(json.data))
        } else {
            document.body.appendChild(document.createTextNode("File could not be read"))
        }   
    } else {
        alert("HTTP-Error: " + response.status)
        document.body.appendChild(document.createTextNode("API request failed"))   
    }
}

test()
