console.log("Twirlip15")

import path from "path"
import express from "express"

const __dirname = path.resolve()

const host = "127.0.0.1"
const port = 8080

const app = express();
app.use(express.static(process.cwd()))

/*
app.get("/", function(request, response) {
    response.send("Hello!!")
})
*/

app.listen(port, host)

console.log("cwd", process.cwd())