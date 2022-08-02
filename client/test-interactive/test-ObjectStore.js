import { ObjectStore } from "../common/ObjectStore.js"
import { Twirlip15ServerAPI } from "../common/twirlip15-api.js"

async function test() {
    const twirlipServer = new Twirlip15ServerAPI(error => console.log(error))

    let resolveFunction
    const promise = new Promise(resolve => resolveFunction = resolve)

    const o = ObjectStore(() => { console.log("simulated redraw"); setTimeout(resolveFunction, 1000) }, twirlipServer, "/tmp/")

    console.log("test start", o("test"))
    console.log("test2 start", o("test2"))

    await promise

    console.log("test after wait", o("test"))
    console.log("test2 after wait", o("test2"))

    console.log("============== adding data")

    o("test", "height", 12)
    o("test", "width", 60)
    o("test", "children", "Child1", "insert")
    o("test", "children", "Child2", "insert")
    o("test", "children", "Child3", "insert")

    console.log("test height", o("test", "height"))
    console.log("test height", o("test", "width"))
    console.log("test children", o("test", "children"))
    console.log("test", o("test"))

    o("test", "children", "Child2", "remove")

    console.log("test remove", o("test"))

    o("test", "children", "", "clear")

    console.log("test clear", o("test"))

    o("test2", "height", 112)
    o("test2", "width", 160)

    console.log("test2", o("test2"))
    console.log("test (again)", o("test"))
}

test()
