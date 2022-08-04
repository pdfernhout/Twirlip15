import { ObjectStore } from "../common/ObjectStore.js"
import { Twirlip15ServerAPI } from "../common/twirlip15-api.js"

// To deal with firefox displaying later object version not the version when logged
function copyForPrinting(object) {
    if (object === undefined) return "<undefined>"
    return JSON.parse(JSON.stringify(object))
}

async function test() {
    const twirlipServer = new Twirlip15ServerAPI(error => console.log(error))

    let resolveFunction
    const promise = new Promise(resolve => resolveFunction = resolve)
    // Ensure resolve is called even if file loading fails
    setTimeout(() => resolveFunction(), 2000)

    const o = ObjectStore(() => { console.log("simulated redraw"); setTimeout(resolveFunction, 1000) }, twirlipServer, "/tmp/")

    console.log("========== just after ObjectStore creation =============")

    console.log("test start", copyForPrinting(o("test")))
    console.log("test2 start", copyForPrinting(o("test2")))

    await promise

    console.log("========== after await =============")

    console.log("o", JSON.stringify(o()))

    console.log("test after wait", copyForPrinting(o("test")))
    console.log("test2 after wait", copyForPrinting(o("test2")))

    console.log("============== adding data ==============")

    o("test", "height", 12)
    o("test", "width", 60)
    o("test", "children", "Child1", "insert")
    o("test", "children", "Child2", "insert")
    o("test", "children", "Child3", "insert")

    console.log("test height", o("test", "height"))
    console.log("test height", o("test", "width"))
    console.log("test children", o("test", "children"))
    console.log("test", copyForPrinting(o("test")))

    o("test", "children", "Child2", "remove")

    console.log("test remove", copyForPrinting(o("test")))

    o("test", "children", "", "clear")

    console.log("test clear", copyForPrinting(o("test")))

    o("test2", "height", 112)
    o("test2", "width", 160)

    console.log("test2", copyForPrinting(o("test2")))
    console.log("test (again)", copyForPrinting(o("test")))
}

test()
