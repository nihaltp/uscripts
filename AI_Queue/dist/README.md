# AI Queue Dist

This folder contains the built userscripts that should be installed in the browser.

- [`chatgpt.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/chatgpt.user.js) is the compiled ChatGPT queue script.
- [`gemini.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/gemini.user.js) is the compiled Gemini queue script.
- `*.map` files are source maps for debugging.

These files are generated from the modular source in `../core/` and `../providers/`.
Run `npm run build-aiqueue` after changing the source files.

Do not edit the files in this folder directly unless you are intentionally patching the built output.
