import globals from "globals";

export default [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                GM_addStyle: "readonly",
                GM_getValue: "readonly",
                GM_setValue: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        },
        ignores: [
            "node_modules/**",
            "**/dist/**"
        ]
    },
    {
        files: ["AI Queue/build.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node
            }
        }
    }
];
