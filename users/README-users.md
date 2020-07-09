Users and password hashes for basic auth for https go in users.json.
Use "node server/add-user.js" from top-level project folder to add users to that file.
That command creates the appropriate password hashes for you.

The format is:
{
    "userid1": {
        "passwordHash": "...", 
        "variousotheruserfields": "..."
        ...
    },
    "userid2": {
        "passwordHash": "...", 
        "variousotheruserfields": "..."
        ...
    },
}
