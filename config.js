export const config = {
  username: "nihaltp",
  repo: "uscripts",
  mainBranch: "main",
  outputDir: "dist",
  githubUrl: "https://github.com",
  githubRawBase: "https://raw.githubusercontent.com",
  defaultLicense: "MIT",
};

config.repoPath = `${config.username}/${config.repo}`;
config.githubRepo = `${config.githubUrl}/${config.repoPath}`;
config.supportUrl = `${config.githubRepo}/issues/new?template=bug.yml`;
config.downloadGithubRawUrl = `${config.githubRawBase}/${config.repoPath}/${config.mainBranch}`;
