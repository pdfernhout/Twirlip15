/* global require, process */

const fs = require("fs")
const bcrypt  = require("bcrypt")
const canonicalize = require("canonicalize")
var readlineSync = require("readline-sync")

const saltRounds = 10

const usersFileName = "users/users.json"

let users = null 
try {
    users = JSON.parse(fs.readFileSync(usersFileName))
} catch (error) {
    console.log("A users file of " + usersFileName + " was not found -- creating it")
    users = {}
}

function saveHashedPassword(nameSupplied, passwordSupplied) {
    bcrypt.hash(passwordSupplied, saltRounds, function(err, hash) {
        if (err) {
            console.log("something went wrong using bcrypt.hash")
            process.exit(-1)
        }
        users[nameSupplied] = hash

        /*
        bcrypt.compare(passwordSupplied, hash, function(err, result) {
            if (err) {
                console.log("something went wrong using bcrypt.compare")
                process.exit(-1)
            }
        console.log("compare result", result)
        })
        */

        // Write names in alphabetical order
        fs.writeFileSync(usersFileName, JSON.stringify(JSON.parse(canonicalize(users)), null, 4))
        console.log("Updated user file for", nameSupplied)
        process.exit(0)
    })
}

const nameSupplied = readlineSync.question("What user name to add or change? ")
if (!nameSupplied) {
    console.log("exiting as no user name supplied")
    process.exit(0)
}
const passwordSupplied = readlineSync.question("Password? ", { hideEchoBack: true })
if (!passwordSupplied) {
    console.log("exiting as no password supplied")
    process.exit(0)
}
const passwordSuppliedCheck = readlineSync.question("Password again to confirm? ", { hideEchoBack: true })

if (passwordSupplied === passwordSuppliedCheck) {
    saveHashedPassword(nameSupplied, passwordSupplied)
} else {
    console.log("passwords do not match; exiting")
}
