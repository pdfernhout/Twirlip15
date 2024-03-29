/* global m */

// Only supports one modal at a time

/* Test in your main form (use only one ModalInputView per application):
    m(ModalInputView),
    m("div",
        m("button", { onclick: () => modalAlert("test alert!").then(alert) }, "Test modal alert"),
        m("button", { onclick: () => modalConfirm("test confirm?").then(alert) }, "Test modal confirm"),
        m("button", { onclick: () => modalPrompt("test prompt", "default").then(alert) }, "Test modal prompt"),
    ),
*/

// type ModalCallback = (() => m.Vnode) | null

let modalCallback /* ModalCallback */ = null

export function setModalCallback(callback) {
    if (callback && modalCallback) {
        alert("Only supports one modal at a time")
        throw new Error("Only supports one modal at a time")
    }
    modalCallback = callback
    m.redraw()
}

// type ModalType = "alert" | "confirm" | "prompt"

export function modalAlert(promptText) {
    // Promise result is "OK"
    return standardModal(promptText, "alert", "OK")
}

export function modalConfirm(promptText) {
    // Promise result is null or "OK"
    return standardModal(promptText, "confirm", "OK")
}

export function modalPrompt(promptText, defaultText = "") {
    // Promise result is null or entered text
    return standardModal(promptText, "prompt", defaultText)
}

export function weaveIntoArray(array, item) {
    const result = []
    for (let element of array) {
        result.push(element)
        result.push(item)
    }
    if (result.length) result.pop()
    return result
}

function standardModal(promptText, modalType, defaultText = "") {
    let value = defaultText
    // eslint-disable-next-line no-unused-vars
    return new Promise((resolve, reject) => {
        setModalCallback(() => {
            return m("div.mt5.ml-auto.mr-auto.bg-near-white.pa3.br3",
                { key: "standardModal", style: "width: 40rem" },
                m("div.ma2", weaveIntoArray(promptText.split("\n"), m("br"))),
                modalType === "prompt" && m("div.ma2",
                    m("input.w-100", {
                        value: value,
                        oninput: (event) => { value = event.target.value },
                        oncreate: (vnode) => {
                            const input = vnode.dom
                            input.focus()
                            input.selectionStart = 0
                            input.selectionEnd = value.length
                        },
                        // TODO: Handle escape or enter even if no input
                        onkeydown: (event) => {
                            if (event.keyCode === 13) {
                                // enter
                                setModalCallback(null)
                                resolve(value)
                                return false
                            } else if (event.keyCode === 27) {
                                // escape
                                setModalCallback(null)
                                resolve(null)
                                return false
                            }
                            return true
                        },
                    }),
                ),
                m("div.ma2.mt3.flex.justify-end", 
                    modalType !== "alert" && m("button", {
                        onclick: () => {
                            setModalCallback(null)
                            resolve(null)
                        }
                    }, "Cancel"),
                    m("button.ml3.w3", {
                        onclick: () => {
                            setModalCallback(null)
                            resolve(value)
                        }
                    }, "OK"),
                ),
            )
        })
    })
}

export function customModal(drawFunction, style) {
    return new Promise((resolve, reject) => {
        setModalCallback(() => m("div.mt5.ml-auto.mr-auto.bg-near-white.pa3.br3",
            { key: "customModal", style: style || "width: 32rem" },
            drawFunction(
                (value) => { setModalCallback(null); resolve(value) },
                (value) => { setModalCallback(null); reject(value) }
            ))
        )
    })
}

export class ModalInputView {
    view() {
        if (modalCallback) {
            return m("div.ModalInputView.overlay.pt6.overflow-auto",
                modalCallback()
            )
        } else {
            return []
        }
    }
}
