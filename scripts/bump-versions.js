const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function runGitLog(args) {
  try {
    return execFileSync('git', ['log', ...args], { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error(`Command failed: git log ${args.join(' ')}`, e.message);
    return '';
  }
}

// 1. Get environment variables
const changedFilesStr = process.env.CHANGED_FILES || '';
const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;

if (!changedFilesStr) {
  console.log('No files changed.');
  process.exit(0);
}

const changedFiles = changedFilesStr.split(/\s+/).filter(Boolean);

// 2. Determine top-level folders that had changes
const changedFolders = new Set();
const manualVersionUpdates = new Set();

changedFiles.forEach(file => {
  const parts = file.split('/');
  if (parts.length > 1) {
    const folder = parts[0];
    changedFolders.add(folder);
    
    if (parts[1] === 'versions.json') {
      manualVersionUpdates.add(folder);
    }
  }
});

console.log('Changed folders:', Array.from(changedFolders));
console.log('Folders with manual version updates:', Array.from(manualVersionUpdates));

// 3. Process each folder
changedFolders.forEach(folder => {
  if (manualVersionUpdates.has(folder)) {
    console.log(`Skipping ${folder}: versions.json was manually updated.`);
    return;
  }

  const versionsPath = path.join(folder, 'versions.json');
  if (!fs.existsSync(versionsPath)) {
    console.log(`Skipping ${folder}: no versions.json found.`);
    return;
  }

  // Determine bump type
  let isMinor = false;
  let logOutput = '';
  
  if (baseSha && headSha) {
    // We have a specific range
    logOutput = runGitLog([`${baseSha}..${headSha}`, '--', folder]);
  } else {
    // Fallback to checking the last commit for this folder
    logOutput = runGitLog(['-1', '--', folder]);
  }

  if (/feat/i.test(logOutput)) {
    isMinor = true;
    console.log(`[${folder}] Found 'feat' in commit log. Will bump MINOR.`);
  } else {
    console.log(`[${folder}] No 'feat' found in commit log. Will bump PATCH.`);
  }

  // Read and update versions.json
  try {
    const versionsData = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
    let updated = false;

    for (const key in versionsData) {
      const versionStr = versionsData[key];
      const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)$/);
      
      if (match) {
        let [, major, minor, patch] = match;
        if (isMinor) {
          minor = parseInt(minor, 10) + 1;
          patch = 0;
        } else {
          patch = parseInt(patch, 10) + 1;
        }
        versionsData[key] = `${major}.${minor}.${patch}`;
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(versionsPath, JSON.stringify(versionsData, null, 2) + '\n');
      console.log(`Successfully bumped versions in ${versionsPath}`);
    } else {
      console.log(`No valid semantic versions found to bump in ${versionsPath}`);
    }
  } catch (err) {
    console.error(`Error processing ${versionsPath}:`, err.message);
  }
});
