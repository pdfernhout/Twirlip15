export function makeTimeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

let debounceTimer

// Only supports once debounced function per application
export function debounce(callback, time=500) {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(callback, time)
}
