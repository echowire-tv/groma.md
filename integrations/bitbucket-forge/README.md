# Groma comparisons in Bitbucket Cloud pull requests

A Forge app adds an **Architecture comparison** panel to the Overview tab of every pull request. The panel shows
Groma's before/after map from the pull request's merge base to its source commit. Nothing private leaves Bitbucket.
Every request the panel makes runs as the person viewing it, so it can read only what that person can read.

## How it works

1. `pipeline/bitbucket-pipelines.yml` runs on every pull request. `pipeline/groma-pipeline.mjs` runs
   `groma export --from <merge base> --revision $BITBUCKET_COMMIT --host-sources`. Export runs from an empty working
   tree, so no project plugin or scanner runs. The script then force-pushes the exported page as `comparison.html`
   to branch `groma-pr-<id>`. That branch holds one commit with no history in common with the repository.
2. The panel's resolver (`src/index.ts`) uses `api.asUser().requestBitbucket` to read the pull request, the
   `groma-pr-<id>` branch and `comparison.html`.
3. The host page (`panel/host.ts`) mounts the stored page and installs `globalThis.gromaReadSource`. It then loads
   Groma's `render.js`. Changed files render from the diff hunks stored in the page. Every other file the viewer
   opens is read through the resolver, at its commit.
4. If the stored page is for an older commit than the pull request's source commit, the panel says so. If the branch
   does not exist yet, it says the pipeline has not written a comparison.

Forge returns at most 5 MB from a resolver call. The page leaves out source text and the 2.8 MB stylesheet, which
ships with the app. A comparison of 20 commits of groma.md is 2.0 MB.

## Build

```sh
cd integrations/bitbucket-forge
npm install
npm run build      # writes static/: the host page, render.js and style.css built from this checkout
npm run typecheck
```

`npm run build` needs Bun, as the rest of this repository does.

## Steps only a person can do

Run `./setup.sh` to be guided through them in order, or follow this list:

1. **Groma release.** Released groma.md 0.7.8 has no `--host-sources` option. Publish a release of this fork. In
   the Bitbucket repository, set the variable `GROMA_PACKAGE` to its npm install spec, for example a package name
   with an exact version, or a tarball URL.
2. **Forge CLI.** Run `npm install --global @forge/cli`, then `forge login`. Login needs an Atlassian API token.
3. **Register.** In this directory, run `forge register`. It adds `app.id` to `manifest.yml`. Commit that change.
4. **Deploy.** Run `npm install && npm run build`, then `forge deploy -e development`.
5. **Install.** Run `forge install -p bitbucket -e development`. Enter the workspace URL, for example
   `https://bitbucket.org/<workspace>/`. The workspace must be a shared workspace, and the install must accept the
   `read:repository:bitbucket` and `read:pullrequest:bitbucket` scopes.
6. **Pipeline files.** Copy `pipeline/bitbucket-pipelines.yml` and `pipeline/groma-pipeline.mjs` to the root of
   the Bitbucket repository and commit them. If the repository already has a `bitbucket-pipelines.yml`, merge in the
   `pull-requests` and `custom` entries.
7. **Enable Pipelines.** Go to Repository settings → Pipelines → Settings and enable Pipelines.
8. **Push access.** The pipeline pushes `groma-pr-<id>` with its default credentials. A branch restriction that
   matches `groma-pr-*` blocks that push.
9. **Optional pull request comment.** Create a repository access token with pull request read and write
   permission. Store it as the secured variable `GROMA_BITBUCKET_TOKEN`, and set `GROMA_PR_COMMENT` to `true`. The
   pipeline then posts the change counts as a comment, and updates that comment on later runs.
10. **Cleanup.** The `groma-cleanup` custom pipeline deletes `groma-pr-<id>` branches of pull requests that are no
    longer open. It needs `GROMA_BITBUCKET_TOKEN` to list open pull requests. Under Pipelines → Schedules, schedule
    it daily on the main branch.

## Not verified

None of this has run in Bitbucket or Forge yet. Untested there:

- the fonts in `style.css`, which are `data:` URLs, under the Forge Custom UI content security policy
- the panel height, which `panel/host.css` sets to 720px
- `BITBUCKET_COMMIT` as the pull request's source commit in a pull request pipeline
- the pipeline's push of `groma-pr-<id>` with its default credentials

The published viewer requests `version.js` once a second. `static/version.js` is empty, so each request succeeds
and does nothing.
