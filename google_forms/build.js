// build.js — Google Forms Saver build script
// Mirrors the structure of AI Queue/build.js
const esbuild = require('esbuild');
const fs = require('fs/promises');
const path = require('path');
const prettier = require('prettier');

const rootDir = __dirname;
const versions = require('./versions.json');

const builds = [
  {
    id: 'google-forms-saver',
    name: 'Google Forms Saver',
    description:
      'Save and restore your Google Forms responses. Supports all field types, multiple named saves, and per-field conflict resolution.',
    // @match is Chrome-extension-style (path only, no query string).
    // @include is Greasemonkey glob-style — matches query strings too.
    matches: [],
    includes: [
      'https://docs.google.com/forms/d/e/*',
      'https://docs.google.com/forms/u/0/d/e/*',
    ],
    excludes: [],
    grants: ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues'],
    icon: 'https://www.google.com/s2/favicons?sz=64&domain=docs.google.com',
    runAt: 'document-idle',
    entry: 'entry.js',
    outfile: 'dist/google-forms-saver.user.js',
  },
];

async function buildAll() {
  for (const app of builds) {
    const matchLines = app.matches.map((m) => `// @match        ${m}`).join('\n');
    const includeLines = (app.includes || []).map((i) => `// @include      ${i}`).join('\n');
    const excludeLines = app.excludes.map((e) => `// @exclude      ${e}`).join('\n');
    const grantLines = app.grants.map((g) => `// @grant        ${g}`).join('\n');

    const supportUrl = `https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20${encodeURIComponent(app.name)}%20${encodeURIComponent(app.outfile)}&body=File%3A%20google_forms%2F${encodeURIComponent(app.outfile)}%0A%0ADescribe%20issue%20here...`;
    const downloadBase = `https://raw.githubusercontent.com/nihaltp/uscripts/main/google_forms/${app.outfile}`;

    const banner =
      `// ==UserScript==\n` +
      `// @name         ${app.name}\n` +
      `// @description  ${app.description}\n` +
      `// @author       nihaltp\n` +
      `// @namespace    https://github.com/nihaltp/uscripts\n` +
      `// @supportURL   ${supportUrl}\n` +
      `// @homepageURL  https://github.com/nihaltp/uscripts\n` +
      `// @homepage     https://github.com/nihaltp/uscripts\n` +
      `// @license      MIT\n` +
      `${matchLines}${matchLines ? '\n' : ''}` +
      (includeLines ? `${includeLines}\n` : '') +
      (excludeLines ? `${excludeLines}\n` : '') +
      `// @icon         ${app.icon}\n` +
      `// @version      ${versions[app.id]}\n` +
      `${grantLines}\n` +
      `// @downloadURL  ${downloadBase}\n` +
      `// @updateURL    ${downloadBase}\n` +
      `// @run-at       ${app.runAt}\n` +
      `// ==/UserScript==\n`;

    await esbuild.build({
      entryPoints: [path.resolve(rootDir, app.entry)],
      bundle: true,
      outfile: path.resolve(rootDir, app.outfile),
      format: 'iife',
      target: 'es2020',
      sourcemap: true,
      banner: { js: banner },
      loader: { '.css': 'text' },
    });

    // Format the output with prettier for readability
    const outputPath = path.resolve(rootDir, app.outfile);
    const code = await fs.readFile(outputPath, 'utf8');
    const prettierConfig = await prettier.resolveConfig(outputPath);
    const formatted = await prettier.format(code, {
      ...prettierConfig,
      parser: 'babel',
    });
    await fs.writeFile(outputPath, formatted);

    console.log(`✓ Built ${app.outfile}`);
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
