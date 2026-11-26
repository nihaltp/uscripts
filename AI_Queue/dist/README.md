# AI Queue Dist

This folder contains the built userscripts that should be installed in the browser.

- [`chatgpt.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI_Queue/dist/chatgpt.user.js) is the compiled ChatGPT queue script.
- [`gemini.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI_Queue/dist/gemini.user.js) is the compiled Gemini queue script.
- [`notebook.user.js`](https://raw.githubusercontent.com/nihaltp/uscripts/main/AI_Queue/dist/notebook.user.js)
- `*.map` files are source maps for debugging.

These files are generated from the modular source in `../core/` and `../providers/`.
Run `npm run build-aiqueue` after changing the source files.

Do not edit the files in this folder directly unless you are intentionally patching the built output.
