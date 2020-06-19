async function test() {
    const response = await fetch("/twirlip15-api/file-directory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify({fileName: "/server"})
    })
    document.body.appendChild(document.createElement("br"))
    if (response.ok) {
        const json = await response.json()
        console.log("response", response)
        if (json.ok) {
            const preElement = document.createElement("pre")
            document.body.appendChild(preElement)
            console.log("json", json)
            preElement.appendChild(document.createTextNode(JSON.stringify(json.files, null, 4)))
        } else {
            document.body.appendChild(document.createTextNode("Directory could not be read"))
        }   
    } else {
        alert("HTTP-Error: " + response.status)
        document.body.appendChild(document.createTextNode("API request failed"))   
    }
}

test()
