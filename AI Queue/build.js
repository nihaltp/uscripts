// build.js
const esbuild = require('esbuild');
const fs = require('fs/promises');
const path = require('path');
const prettier = require('prettier');

const rootDir = __dirname;

const versions = require('./versions.json');

const builds = [
  {
    id: 'chatgpt',
    name: 'ChatGPT Prompt Queue',
    description: 'A userscript to manage a queue of prompts for ChatGPT.',
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    icon: 'https://chatgpt.com/favicon.ico',
    grants: ['none'],
    runAt: 'document-idle',
    entry: 'providers/chatgpt.js',
    outfile: 'dist/chatgpt.user.js',
  },
  {
    id: 'gemini',
    name: 'Gemini Prompt Queue',
    description: 'A userscript to manage a queue of prompts for Gemini.',
    matches: ['https://gemini.google.com/app/*'],
    icon: 'https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com',
    grants: ['none'],
    runAt: 'document-idle',
    entry: 'providers/gemini.js',
    outfile: 'dist/gemini.user.js',
  },
];

async function buildAll() {
  for (const app of builds) {
    const matchLines = app.matches.map((m) => `// @match        ${m}`).join('\n');
    const grantLines = app.grants.map((g) => `// @grant        ${g}`).join('\n');

    const banner = `// ==UserScript==
// @name         ${app.name}
// @description  ${app.description}
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20${encodeURIComponent(app.name)}%20${encodeURIComponent(app.outfile)}&body=File%3A%20AI%20Queue%2F${encodeURIComponent(app.outfile)}%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
${matchLines}
// @icon         ${app.icon}
// @version      ${versions[app.id]}
${grantLines}
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/${app.outfile}
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/${app.outfile}
// @run-at       ${app.runAt}
// ==/UserScript==
`;

    await esbuild.build({
      entryPoints: [path.resolve(rootDir, app.entry)],
      bundle: true,
      outfile: path.resolve(rootDir, app.outfile),
      format: 'iife',
      target: 'es2020',
      sourcemap: true,
      banner: {
        js: banner,
      },
    });

    const outputPath = path.resolve(rootDir, app.outfile);
    const code = await fs.readFile(outputPath, 'utf8');
    const prettierConfig = await prettier.resolveConfig(outputPath);
    const formatted = await prettier.format(code, {
      ...prettierConfig,
      parser: 'babel',
    });
    await fs.writeFile(outputPath, formatted);

    console.log(`Built ${app.outfile}`);
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
