// test of eval
/* eslint-disable no-console */
/* global t, root, UUID */

// This can be eval-ed in the outliner to make a new node under root.

console.log("t", t)
console.log("root", root)

const node = new Node(UUID.forType("outlinerNode"))
console.log("new node", node)
const contents = "Test on Eval to Make New Node"

// MAYBE: p.newTransaction("make-new-node")
node.setContents(contents)
node.setParent(root.uuid)
root.addChild(node.uuid)
// MAYBE: p.sendCurrentTransaction()
