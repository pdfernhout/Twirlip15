/* global m */

// For this to work, enclosing elements including html and body need defined height or 100% height.
/* 
    In HTML file:

    <style>
        html, body {
        height: 100%;
        }
    </style>

    In JavaScript view code:

    return m("div.h-100.flex.flex-column",
            ...
            m(ScrolledItemsView, {
                rowHeight: 100,
                items: theItems,
                viewItem: item => m("div.ba.h-100",
                    {key: item.itemNumber}, // optional key
                    m(...)
                )
            })
        )
*/

// Occlusion culling inspired by Leo Horie's essay: http://lhorie.github.io/mithril-blog/an-exercise-in-awesomeness.html
// And Leo's example linked there: http://jsfiddle.net/7JNUy/1/
export function ScrolledItemsView(/* initialVNode */) {
    let scrollTop = 0
    // Use the window height to generate enough item divs the first time view is called
    let containerHeight = window.innerHeight

    // Attributes:
    // rowHeight: number of px for height of each item (fixed for now, defaults to 100)
    // items: the items to display (required)
    // viewItems: the function to display each item (required)

    function onScroll(event) {
        scrollTop = event.target.scrollTop
        containerHeight = event.target.clientHeight
    }

    return {
        view: function(vnode) {
            const rowHeight = vnode.attrs.rowHeight || "100"
            const items = vnode.attrs.items
            if (!items) throw new Error("items must be specified")
            const viewItem = vnode.attrs.viewItem
            if (!viewItem) throw new Error("viewItem must be specified")
            const rowHeightPx = rowHeight + "px"

            const begin = (scrollTop / rowHeight) || 0
            const end = begin + ((containerHeight / rowHeight) || 0) + 2
            const offset = scrollTop % rowHeight

            return m("div.flex-auto.overflow-y-scroll", 
                { onscroll: onScroll },
                m("div.relative",
                    {style: { height: items.length * rowHeight + "px", top: -offset + "px" } },
                    m("div.relative",
                        { style: {top: scrollTop + "px"} },
                        items.slice(begin, end).map(item => m("div.overflow-hidden",
                            { style: { height: rowHeightPx, maxHeight: rowHeightPx, minHeight: rowHeightPx }},
                            viewItem(item)
                        )),
                        // /* For debugging */ m(".fixed.bg-orange", {style: {top: 0, left: 0 }}, "pageY:", pageY, " pageHeight:", pageHeight, " begin:", begin, " end:", end, " offset:", offset)
                    )
                )
            )
        }
    }
}
