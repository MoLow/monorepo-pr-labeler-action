const fs = require('fs/promises')
require('dotenv').config()

const packageInfo = require('./package.json')
console.log(`Starting ${packageInfo.name}`)

const helpers = require('./helpers')

//require octokit rest.js
//more info at https://github.com/octokit/rest.js
const core = require('@actions/core')
const github = require('@actions/github')
const octokit = github.getOctokit(process.env.GITHUB_TOKEN)

let baseDirectories = ''
if (process.env.BASE_DIRS) baseDirectories = `(?:${process.env.BASE_DIRS})\/`

//set eventOwner and eventRepo based on action's env variables
const eventOwnerAndRepo = process.env.GITHUB_REPOSITORY
const eventOwner = helpers.getOwner(eventOwnerAndRepo)
const eventRepo = helpers.getRepo(eventOwnerAndRepo)


async function labelPR(event) {
  if (!event.pull_request) {
    return;
  }
  const eventIssueNumber = event.pull_request.number
  console.log(`adding labels for PR: ${eventIssueNumber}`)

  //get list of files in PR
  const prFiles = await helpers.listPRFiles(octokit, eventOwner, eventRepo, eventIssueNumber)

  //get monorepo repo for each file
  const labels = new Set(prFiles.map(({ filename }) => helpers.getMonorepo(baseDirectories, filename)).filter(Boolean).map((repo) => helpers.getLabel(repo)))

  core.setOutput('labels', JSON.stringify(Array.from(labels)))
  //add label for each monorepo repo
  labels.forEach((repoLabel) => {
    console.log(`labeling repo: ${repoLabel}`)
    helpers.addLabel(octokit, eventOwner, eventRepo, eventIssueNumber, repoLabel)
  })
}


async function labelCommit(event) {
  if (!event.commits) {
    return;
  }

  //get list of files in commit
  console.log("adding labels for commits")
  const commitFiles = new Set();
  for (const commit of event.commits) {
    const { files } = await helpers.listCommitFiles(octokit, eventOwner, eventRepo, commit.id)
    files.forEach((file) => commitFiles.add(file.filename));
  }

  const labels = new Set(Array.from(commitFiles)
    .map((filename) => helpers.getMonorepo(baseDirectories, filename))
    .filter(Boolean)
    .map((repo) => helpers.getLabel(repo)))

  core.setOutput('labels', JSON.stringify(Array.from(labels)))
}

async function prMonorepoRepoLabeler() {
  try {
    //read contents of action's event.json
    const eventData = await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf-8')
    if (!eventData) {
      return;
    }
    const eventJSON = JSON.parse(eventData)
    labelPR(eventJSON);
    labelCommit(eventJSON);
  } catch (error) {
    console.log(error)
  }
}

//run the function
prMonorepoRepoLabeler().catch(console.error)

module.exports.prMonorepoRepoLabeler = prMonorepoRepoLabeler
