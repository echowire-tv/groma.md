// Bitbucket Pipelines steps for the Groma pull request panel (integrations/bitbucket-forge).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PREFIX = 'groma-pr-'
const FILE = 'comparison.html'
const HEADING = '### Groma architecture comparison'

function variable(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Set the ${name} variable`)
  return value
}

function run(command, args, options = {}) {
  // With `stdio: 'inherit'` nothing is captured and execFileSync returns null.
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options })?.trim() ?? ''
}

const git = (args, options) => run('git', args, options)

async function bitbucket(endpoint, init = {}) {
  const repository = `https://api.bitbucket.org/2.0/repositories/${variable('BITBUCKET_WORKSPACE')}/${variable('BITBUCKET_REPO_SLUG')}`
  const url = endpoint.startsWith('https:') ? endpoint : `${repository}${endpoint}`
  const response = await fetch(url, { ...init, headers: {
    Authorization: `Bearer ${variable('GROMA_BITBUCKET_TOKEN')}`, 'Content-Type': 'application/json', ...init.headers } })
  if (!response.ok) throw new Error(`Bitbucket answered ${response.status} for ${url}: ${await response.text()}`)
  return response.json()
}

async function* pages(endpoint) {
  for (let page = await bitbucket(endpoint); ; page = await bitbucket(page.next)) {
    yield* page.values
    if (page.next === undefined) return
  }
}

/** Exports from an empty working tree, as the groma.md GitHub Action does: no project plugin or scanner runs. */
function exportComparison(from, revision) {
  const work = mkdtempSync(path.join(os.tmpdir(), 'groma-work-'))
  const site = mkdtempSync(path.join(os.tmpdir(), 'groma-site-'))
  try {
    mkdirSync(path.join(work, 'groma'))
    run('groma', ['export', site, '--from', from, '--revision', revision, '--host-sources'], {
      cwd: work, stdio: 'inherit', env: { ...process.env, GIT_DIR: git(['rev-parse', '--absolute-git-dir']), GIT_WORK_TREE: work },
    })
    return readFileSync(path.join(site, 'index.html'), 'utf8')
  } finally {
    rmSync(work, { recursive: true, force: true })
    rmSync(site, { recursive: true, force: true })
  }
}

/** One commit holding only the page, so the branch never shares history with the repository. */
function publish(pullRequest, revision, page) {
  const blob = git(['hash-object', '-w', '--stdin'], { input: page })
  const tree = git(['mktree'], { input: `100644 blob ${blob}\t${FILE}\n` })
  const commit = git(['-c', 'user.name=Groma', '-c', 'user.email=groma@pipelines.invalid', 'commit-tree', tree,
    '-m', `Groma comparison of pull request #${pullRequest} at ${revision} [skip ci]`])
  git(['push', '--force', 'origin', `${commit}:refs/heads/${PREFIX}${pullRequest}`], { stdio: 'inherit' })
}

/** renderPage escapes `<` inside the JSON, so the first `</script>` after the opening tag closes it. */
function summary(page) {
  const opening = '<script type="application/json" id="world">'
  const start = page.indexOf(opening) + opening.length
  const { comparison, revision } = JSON.parse(page.slice(start, page.indexOf('</script>', start)))
  const count = statuses => Object.fromEntries(['added', 'modified', 'removed']
    .map(status => [status, statuses.filter(item => item === status).length]))
  return {
    from: comparison.from.id,
    revision: revision.id,
    components: count(Object.values(comparison.components).map(change => change.status)),
    relationships: count(Object.values(comparison.relationships)),
  }
}

async function comment(pullRequest, page) {
  const { from, revision, components, relationships } = summary(page)
  const commits = `https://bitbucket.org/${variable('BITBUCKET_REPO_FULL_NAME')}/commits`
  const row = (name, counts) => `| ${name} | ${counts.added} | ${counts.modified} | ${counts.removed} |`
  const raw = [HEADING, '', '| Changes | Added | Modified | Removed |', '| --- | ---: | ---: | ---: |',
    row('Components', components), row('Relationships', relationships), '',
    'Open **Architecture comparison** on the Overview tab for the before / after map.', '',
    `Compared [${from.slice(0, 7)}](${commits}/${from}) (merge base) → [${revision.slice(0, 7)}](${commits}/${revision}).`].join('\n')
  const endpoint = `/pullrequests/${pullRequest}/comments`
  let existing
  for await (const item of pages(endpoint)) {
    if (!item.deleted && item.content.raw.startsWith(HEADING)) existing = item
  }
  if (existing?.content.raw === raw) return
  const body = JSON.stringify({ content: { raw } })
  if (existing === undefined) await bitbucket(endpoint, { method: 'POST', body })
  else await bitbucket(`${endpoint}/${existing.id}`, { method: 'PUT', body })
}

async function comparison() {
  run('npm', ['install', '--global', variable('GROMA_PACKAGE')], { stdio: 'inherit' })
  const pullRequest = variable('BITBUCKET_PR_ID')
  // A pull request pipeline checks out the source merged with the destination; BITBUCKET_COMMIT is the source commit.
  const revision = git(['rev-parse', variable('BITBUCKET_COMMIT')])
  const destination = variable('BITBUCKET_PR_DESTINATION_BRANCH')
  git(['fetch', '--no-tags', 'origin', `+refs/heads/${destination}:refs/remotes/origin/${destination}`], { stdio: 'inherit' })
  const from = git(['merge-base', `origin/${destination}`, revision])
  const page = exportComparison(from, revision)
  publish(pullRequest, revision, page)
  if (process.env.GROMA_PR_COMMENT === 'true') await comment(pullRequest, page)
}

async function cleanup() {
  const open = new Set()
  for await (const pull of pages('/pullrequests?state=OPEN&pagelen=50')) open.add(`${PREFIX}${pull.id}`)
  const closed = git(['ls-remote', '--heads', 'origin', `${PREFIX}*`]).split('\n').filter(Boolean)
    .map(line => line.split('\t')[1].slice('refs/heads/'.length))
    .filter(branch => !open.has(branch))
  if (closed.length === 0) return
  git(['push', 'origin', '--delete', ...closed], { stdio: 'inherit' })
}

const steps = { comparison, cleanup }
const step = steps[process.argv[2]]
if (step === undefined) throw new Error(`Usage: node groma-pipeline.mjs ${Object.keys(steps).join(' | ')}`)
await step()
