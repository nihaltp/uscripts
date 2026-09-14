// build.js

import esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from "url";
import prettier from 'prettier';

import { config } from '../config.js';
import versions from './versions.json' with { type: 'json' };

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const builds = [
  {
    id: 'chatgpt',
    name: 'ChatGPT Prompt Queue',
    description: 'A userscript to manage a queue of prompts for ChatGPT.',
    matches: ['https://chatgpt.com/*'],
    excludes: [
      'https://chatgpt.com/auth/*',
      'https://chatgpt.com/apps/*',
      'https://chatgpt.com/atlas/*',
      'https://chatgpt.com/codex/*',
      'https://chatgpt.com/business/*',
      'https://chatgpt.com/features/*',
      'https://chatgpt.com/learn/*',
      'https://chatgpt.com/parent-resources/*',
      'https://chatgpt.com/plans/*',
      'https://chatgpt.com/use-cases/*',
      'https://chatgpt.com/backend-anon/*',
      'https://chatgpt.com/account-link/*',
      'https://chatgpt.com/gpts/*',
    ],
    icon: 'https://chatgpt.com/favicon.ico',
    grants: ['none'],
    runAt: 'document-idle',
    entry: 'providers/chatgpt.js',
    outfile: `${config.outputDir}/chatgpt.user.js`,
  },
  {
    id: 'gemini',
    name: 'Gemini Prompt Queue',
    description: 'A userscript to manage a queue of prompts for Gemini.',
    matches: ['https://gemini.google.com/app', 'https://gemini.google.com/app/*'],
    excludes: ['https://gemini.google.com/signin/*'],
    icon: 'https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com',
    grants: ['none'],
    runAt: 'document-idle',
    entry: 'providers/gemini.js',
    outfile: `${config.outputDir}/gemini.user.js`,
  },
];

async function buildAll() {
  for (const app of builds) {
    const matchLines = app.matches.map((m) => `// @match        ${m}`).join('\n');
    const excludeLines = app.excludes.map((e) => `// @exclude      ${e}`).join('\n');
    const grantLines = app.grants.map((g) => `// @grant        ${g}`).join('\n');

    const downloadBase = `${config.downloadGithubRawUrl}/AI_Queue/${app.outfile}`;

    const banner = `// ==UserScript==
// @name         ${app.name}
// @description  ${app.description}
// @author       ${config.username}
// @namespace    ${config.githubRepo}
// @supportURL   ${config.supportUrl}
// @homepageURL  ${config.githubRepo}
// @homepage     ${config.githubRepo}
// @license      ${config.defaultLicense}
${matchLines}
${excludeLines}
// @icon         ${app.icon}
// @version      ${versions[app.id]}
${grantLines}
// @downloadURL  ${downloadBase}
// @updateURL    ${downloadBase}
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
      loader: {
        '.css': 'text',
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
