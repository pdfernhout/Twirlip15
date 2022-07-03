// Upload a file with a sha256 name

/* global sha256 */

// defines sha256
import "../vendor/sha256.js"
const calculateSHA256 = sha256

function chunkSubstr(str, size) {
    // from: https://stackoverflow.com/questions/7033639/split-large-string-in-n-size-chunks-in-javascript/29202760#29202760
    const numChunks = Math.ceil(str.length / size)
    const chunks = new Array(numChunks)

    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size)
    }

    return chunks
}

export function base64ToArrayBuffer(base64) {
    // from: https://stackoverflow.com/questions/21797299/convert-base64-string-to-arraybuffer
    const binary_string =  window.atob(base64)
    const len = binary_string.length
    const bytes = new Uint8Array( len )
    for (let i = 0; i < len; i++)        {
        bytes[i] = binary_string.charCodeAt(i)
    }
    return bytes.buffer
}

export const imageFileExtensions = {
    ai: true,
    bmp: true,
    gif: true,
    ico: true,
    jpg: true,
    jpeg: true,
    png: true,
    psd: true,
    svg: true,
    tif: true,
    tiff: true
}

export function hasImageFileExtension(fileName) {
    const extension = (fileName.substr(fileName.lastIndexOf(".") + 1) || "").toLowerCase()
    return imageFileExtensions[extension] || false
}

export async function uploadAsTriples(store, userID, filename, base64Contents, bytes) {

    // console.log("upload", filename, base64Contents, bytes)

    const sha256 = calculateSHA256(bytes)
    // console.log("file info:", filename, base64Contents, bytes, sha256)

    /*
    const uploadResponder = {
        onLoaded: () => {},
        onAddItem: (item) => {}
    }

    const upload = StoreUsingServer(m.redraw, {sha256: null}, userID)
    upload.connect(uploadResponder)
    upload.setup()
    */

    const extension = (filename.substr(filename.lastIndexOf(".") + 1) || "").toLowerCase()
    const isImageFile = imageFileExtensions[extension] || false

    const sha256WithFileName = sha256 + "?filename=" + encodeURIComponent(filename)
    const url = "sha256/" + sha256WithFileName
    const streamId = {sha256: sha256}

    // Check to make sure the file does not already exists

    /*
    let existed = true
    const response = await fetch(url)
    console.log("fetch response", response)
    if (response.status === 404) {
        existed = false
    }
    */
    // console.log("about to await getStreamStatusAsync")
    const status = await store.getStreamStatusAsync(streamId)
    // console.log("got getStreamStatusAsync status", status)
    const existed = status.exists

    if (!existed) {
        const segmentSize = 100000
        const segments = chunkSubstr(base64Contents, 100000)
        const aField = streamId

        const timestamp = new Date().toISOString()

        // TODO: No error handling
        // TODO: Does not check if it exists already
        await store.addItemAsync({a: aField, b: "filename", c: filename, t: timestamp, u: userID}, streamId)
        await store.addItemAsync({a: aField, b: "format", c: "base64-segments", t: timestamp, u: userID}, streamId)
        await store.addItemAsync({a: aField, b: "bytes-byteLength", c: bytes.byteLength, t: timestamp, u: userID}, streamId)
        await store.addItemAsync({a: aField, b: "base64-length", c: base64Contents.length, t: timestamp, u: userID}, streamId)
        await store.addItemAsync({a: aField, b: "base64-segment-count", c: segments.length, t: timestamp, u: userID}, streamId)
        await store.addItemAsync({a: aField, b: "base64-segment-size", c: segmentSize, t: timestamp, u: userID}, streamId)
        
        // let reconstruct = ""
        for (let i = 0; i < segments.length; i++) {
            // console.log("sending", i + 1, "of", segments.length)
            // reconstruct += segments[i]
            await store.addItemAsync({a: aField, b: "base64-segment:" + i, c: segments[i], t: timestamp, u: userID}, streamId)
        }

        console.log("uploaded", filename, sha256)

        /* verification

        console.log("reconstruct.length", reconstruct.length)
        console.log("binary length", base64ToArrayBuffer(reconstruct).byteLength)
        */
    } else {
        console.log("upload file already exists on server", filename)
    }

    return {
        filename,
        sha256,
        extension,
        isImageFile,
        url,
        existed
    }
}

export async function doesFileExist(twirlipServer, fileName) {
    try {
        const apiStatsResult = await twirlipServer.fileStats(fileName)
        return apiStatsResult && apiStatsResult.ok
    } catch {
        return false
    }
}

export async function uploadFileFromBase64Contents(twirlipServer, base64Contents, directoryPath, fileName, showStatus=null) {
    // Could improve so does not read file into memory first so could handle larger files
    const tempFileName = directoryPath + ("Upload-" + new Date().toISOString() + ".temp")
    const finalFileName = directoryPath + fileName
    const extension = (fileName.substr(fileName.lastIndexOf(".") + 1) || "").toLowerCase()
    const isImageFile = imageFileExtensions[extension] || false

    if (await doesFileExist(twirlipServer, finalFileName)) {
        return {
            filename: fileName,
            extension,
            isImageFile,
            url: finalFileName,
            existed: true
        }
    }

    let success = false
    // Chunk size needs to be a multiple of 4 so that base64 data is not corrupted
    const chunkSize = 400000
    for (let i = 0; i < base64Contents.length; i = i + chunkSize) {
        // console.log("i", i, i + chunkSize, base64Contents.length, chunkSize, Math.round((i / (base64Contents.length + 1)) * 100) + "%" )
        if (showStatus) showStatus("Upload progress: " + Math.round((i / (base64Contents.length + 1)) * 100) + "%" )
        const apiResultAppend = await await twirlipServer.fileAppend(tempFileName, base64Contents.substring(i, i + chunkSize), "base64")
        success = !!apiResultAppend
        if (!success) break
    }

    if (success) {
        if (showStatus) showStatus("File uploaded almost done; finishing up")
        const apiResultRename = await twirlipServer.fileRenameOne(tempFileName, finalFileName)
        if (!apiResultRename) {
            return false
        }
    } else {
        // null indicates earlier error saving data, not a rename failure
        return null
    }

    return {
        filename: fileName,
        extension,
        isImageFile,
        url: finalFileName,
        existed: false
    }
}
