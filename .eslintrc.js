/* global module */
module.exports = {
    "env": {
        "browser": true,
        "es2020": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 11,
        "sourceType": "module"
    },
    rules: {
        "semi": ["error", "never"],
        "quotes": ["error", "double"]
    }
}
