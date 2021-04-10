/* global m */

export const menuHoverColor = ".hover-bg-orange"

export function menuTopBar(parts) {
    return m("div.ma1.ml4.bg-light-green", parts)
}

export function menuButton(label, action, disabled) {
    return m("span.dib.pa2" + menuHoverColor + (disabled ? ".disabled-button" : ""), {
        onclick: action, 
    }, label)
}

export function menuCheckbox(label, checked, action, disabled) {
    return m("label.dib.pa2" + menuHoverColor + (disabled ? ".disabled-button" : ""), 
        m("input[type=checkbox].mr1", {
            checked: checked,
            onclick: action
        }),
        label
    )
}
