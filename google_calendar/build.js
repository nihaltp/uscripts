const esbuild = require('esbuild');
const fs = require('fs/promises');
const path = require('path');
const prettier = require('prettier');

const rootDir = __dirname;
const versions = require('./versions.json');

const builds = [
  {
    id: 'gcal_multiday',
    name: 'Google Calendar Multi-Day Grid Viewer',
    description: 'Displays multi-day events in the hourly grid of Google Calendar rather than at the top.',
    matches: ['https://calendar.google.com/calendar/*'],
    excludes: [],
    icon: 'https://calendar.google.com/googlecalendar/images/favicons_2026/calendar_31_256.ico',
    grants: ['none'],
    runAt: 'document-idle',
    entry: 'index.js',
    outfile: 'dist/gcal-multiday-grid.user.js',
  },
];

async function buildAll() {
  for (const app of builds) {
    const matchLines = app.matches.map((m) => `// @match        ${m}`).join('\n');
    const excludeLines = app.excludes.map((e) => `// @exclude      ${e}`).join('\n');
    const grantLines = app.grants.map((g) => `// @grant        ${g}`).join('\n');

    const banner = `// ==UserScript==
// @name         ${app.name}
// @description  ${app.description}
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
${matchLines}
${excludeLines ? excludeLines + '\n' : ''}// @icon         ${app.icon}
// @version      ${versions[app.id]}
${grantLines}
// @run-at       ${app.runAt}
// ==/UserScript==
`;

    await esbuild.build({
      entryPoints: [path.resolve(rootDir, app.entry)],
      bundle: true,
      outfile: path.resolve(rootDir, app.outfile),
      format: 'iife',
      target: 'es2020',
      sourcemap: false,
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

    console.log(`Built ${rootDir}/${app.outfile}`);
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
