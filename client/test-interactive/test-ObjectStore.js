import { ObjectStore } from "../common/ObjectStore.js"

function test() {
    const o = ObjectStore()

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
}

test()
