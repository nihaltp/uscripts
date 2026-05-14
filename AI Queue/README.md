# AI Queue

This folder contains the source for the AI Queue userscripts.

## Scripts

- [`chatgpt.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/chatgpt.user.js) is the userscript for ChatGPT.
- [`gemini.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/gemini.user.js) is the userscript for Gemini.

## Layout

- [`core/`](core/) contains shared queue, UI, storage, and browser interaction helpers.
- [`providers/`](providers/) contains the ChatGPT and Gemini entrypoints and provider-specific behavior.
- [`dist/`](dist/) contains the built userscripts that should be installed in the browser.
- [`build.js`](build.js) bundles the source files into the distributable scripts.
- [`versions.json`](versions.json) tracks the published script versions.

## Build

Run `npm run build-aiqueue` after changing files in `core/` or `providers/`.

The generated output in `dist/` should not be edited directly unless you are intentionally patching the built bundle.
