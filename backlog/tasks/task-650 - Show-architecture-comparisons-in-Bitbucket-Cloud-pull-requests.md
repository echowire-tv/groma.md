---
id: TASK-650
title: Show architecture comparisons in Bitbucket Cloud pull requests
status: Done
assignee:
  - '@claude'
created_date: '2026-11-05T08:25:00Z'
updated_date: '2026-11-05T08:43:00Z'
labels: []
dependencies: []
references:
  - src/viewers/web/export.ts
  - src/viewers/web/data.ts
  - src/viewers/web/page.ts
  - src/cli.ts
  - .github/workflows/architecture.yml
modified_files:
  - src/viewers/web/payload.ts
  - src/viewers/web/data.ts
  - src/viewers/web/page.ts
  - src/viewers/web/export.ts
  - src/cli.ts
  - docs/viewers/web/index.md
  - test-bun/web-export.test.ts
  - integrations/bitbucket-forge/package.json
  - integrations/bitbucket-forge/src/index.ts
  - integrations/bitbucket-forge/panel/index.html
  - integrations/bitbucket-forge/panel/host.css
  - integrations/bitbucket-forge/panel/host.ts
  - integrations/bitbucket-forge/tsconfig.json
  - integrations/bitbucket-forge/.gitignore
  - scripts/build-bitbucket-forge.ts
  - integrations/bitbucket-forge/manifest.yml
  - integrations/bitbucket-forge/package-lock.json
  - integrations/bitbucket-forge/pipeline/bitbucket-pipelines.yml
  - integrations/bitbucket-forge/pipeline/groma-pipeline.mjs
  - integrations/bitbucket-forge/README.md
  - integrations/bitbucket-forge/setup.sh
  - groma/systems/groma-md/containers/export/components/bitbucket-panel.md
type: feature
ordinal: 706000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The fork is used on private Bitbucket Cloud repositories. The GitHub integration publishes the export to GitHub Pages; Bitbucket has no equivalent, and hosting a private export elsewhere needs authorization the organization has not provisioned. A Forge Custom UI panel on the pull request Overview tab shows the comparison inside Bitbucket instead, and reads every private byte through the viewing user's Bitbucket permissions. A Forge front-end resolver may return at most 5 MB, while the static export of this repository inlines about 480 source files per view (10.8 MB), so the stored comparison must leave source text out and the panel reads files on demand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A comparison export for a host leaves out source file text and its page links the stylesheet, so the stored page for this repository (HEAD~20 to HEAD) is well under 5 MB
- [x] #2 The published viewer reads a source file missing from the export through a reader the embedding page installs, and still reports a missing file when no reader is installed
- [x] #3 Static exports without the new option are unchanged
- [x] #4 A Forge app in integrations/bitbucket-forge builds locally: a pull request Overview panel whose resolver reads the stored comparison and source files as the viewing user, and says when no comparison exists or it is for an earlier commit
- [x] #5 A Bitbucket Pipelines template computes the merge base, exports the comparison with a pinned groma release, and force-pushes it to branch groma-pr-<id>; a custom pipeline deletes the branches of pull requests that are no longer open; a pull request comment with change counts is optional and off by default
- [x] #6 A runbook lists the steps only a person can perform: Forge login, register, deploy and install, enabling Pipelines and its push access, and the optional variables
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Acceptance criteria have objective verification evidence.
- [x] #2 Relevant checks pass and changes remain task-scoped.
- [x] #3 Public contracts or documentation are updated when behavior changes.
- [x] #4 Implementation Plan reflects the final approach; correction history and verification are recorded in Implementation Notes.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Export: `groma export <dir> --revision B [--from A] --host-sources` drops `reads.sources` from every published view after the comparison hunks are computed and writes index.html linking `./style.css`, plus style.css and render.js (no covers, snapshot.js or version.js). The stored artifact is this page: its chrome (title, revision fields, empty state) is rendered from the payload by page.ts, which uses node:fs and cannot run in the browser.
2. Viewer: `publishedDataSource.readSource` calls `globalThis.gromaReadSource(file, commit)` for a file missing from the view, with that view's commit; without a reader it still throws "Source file not found". Changed files in a comparison render from the stored hunks and never call readSource.
3. Boot: render.ts is unchanged. The host page parses the stored page with DOMParser, adopts its body (including the inert `<script id="world">`), installs the reader and appends render.js.
4. Forge app in integrations/bitbucket-forge: manifest (repoPullRequestOverviewPanel + resolver function), resolver getComparison/getSource through `asUser().requestBitbucket`, host page in panel/, scripts/build-bitbucket-forge.ts writes static/ (host page, host.js, render.js, style.css, empty version.js).
5. integrations/bitbucket-forge/pipeline: bitbucket-pipelines.yml template plus groma-pipeline.mjs (comparison step exports from an empty working tree and pushes an orphan commit to groma-pr-<id>; cleanup custom pipeline; optional comment behind GROMA_PR_COMMENT).
6. README runbook and setup.sh wizard for the steps only a person can do.
Tests: extend test-bun/web-export.test.ts (export bundles the renderer with Bun.build, so export tests run under bun). Rule: a host-sources export ships no source text but keeps hunks (AC1), and a missing file is read through the installed reader with the view commit, or still reports not found without one (AC2). Failures detected: sources still embedded, hunks missing, reader not called or called with the wrong commit. Gap: the existing test only reads embedded sources.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Stored artifact is the exported page, not bare payload JSON: the page chrome (title, revision fields, empty state) is a function of the payload rendered by page.ts, which reads files with node:fs and cannot run in the browser. `--host-sources` (instead of the planned `--payload <file>`) writes index.html with `<link rel="stylesheet" href="./style.css">`, plus style.css and render.js; the 2.8 MB inline stylesheet (base64 fonts) is static and ships in the Forge resource instead.
All `reads.sources` are dropped, including changed files: in a comparison, changed files render from `comparison.components[].files[].hunks` (source/control.ts `changedFile` returns before calling readSource), so their full text only serves the single-commit views, which read it through the host like any other file.
Measured on this repository, `--from HEAD~20 --revision HEAD` (9f2590fe), exported from an empty working directory with GIT_DIR as the GitHub action does: static export index.html 13.61 MB (payload 10.71 MB); payload keeping only the 31 changed files' sources 2.71 MB; `--host-sources` index.html 2.03 MB (payload 2.00 MB, of which comparison with hunks 0.49 MB; the top-level boot payload repeats the comparison view's 0.75 MB payload), 2.27 MB as a JSON-encoded resolver response, against the 5 MB limit. Exported from the repository root instead, scanner outlines add about 0.33 MB of `reads.code` per commit view (2.70 MB page).
Export tests live in test-bun/, not test/: export bundles the renderer with Bun.build.

Deviations from the planned layout: one integration directory, integrations/bitbucket-forge, holds the Forge app and the pipeline template (pipeline/). This repository is on GitHub, so a root bitbucket-pipelines.yml would never run; the template is copied into each Bitbucket repository. The comparison branch is `groma-pr-<id>` instead of `groma/pr-<id>`: `@forge/api` `route` refuses interpolated values containing `/`. The pull request comment is identified by its first line, `### Groma architecture comparison`, because Bitbucket Markdown shows raw HTML such as the GitHub workflow marker comment. The PR source commit from the API is abbreviated, so the panel compares it as a prefix of the page revision. Staleness is decided in the host page, which already parses the page with DOMParser.
The pipeline needs a groma.md release with `--host-sources` (variable GROMA_PACKAGE); released 0.7.8 lacks it.
Verification: `bun run check` with bun 1.4.4 and node 24.22.2 (package.json asks for node >= 26.12.1): Biome clean except 2 existing warnings, tsc clean, node tests 26/26, bun tests 28 failures identical to the baseline on main (missing java, swiftc, scala, kotlin, cobol toolchains), new export test passes and fails with the data.ts change reverted. Forge app: `npm run typecheck` clean, `npm run build` writes static/. `forge lint` (CLI 15.0.0) reports only the missing `app.id`; with a placeholder id it requires `forge login`, so full lint did not run. Pipeline YAML parses with Bun.YAML. groma-pipeline.mjs comparison step run against a local bare origin (fake npm, groma from source): pushed one orphan commit holding comparison.html (2.03 MB) in 1.5 s; comment and cleanup run with a stubbed fetch: comment POSTed with counts (8 added, 10 modified components), cleanup deleted the branch of a non-open PR and kept the open one. Panel host booted in headless Chrome 1200x720 with a stubbed @forge/bridge serving the stored page: map rendered in comparison mode, opening unchanged src/viewers/web/data.ts called getSource with the head commit and showed the returned text, the stale notice appeared for a mismatching head, and the viewer requested version.js once a second.
Not verified (no Bitbucket workspace or Forge login): Forge CSP for data: fonts, panel iframe height, resolver context fields at runtime, Pipelines push with default credentials, BITBUCKET_COMMIT being the PR source commit.

Cold simplicity review applied: inlined the reader type into the global declaration, inlined the branch name helper, dropped the commit-format check (`route` refuses path manipulation in interpolated values), dropped an overlapping test assertion, cut the README's unverified list to plain facts. Kept `limited()` (the plan asks for a clear error at the 5 MB limit) and the `delivery.kind` guard in withoutSources (needed for type narrowing). The full-context complexity review in a separate agent was not run in this session. After the fixes: `bun run check` again shows the baseline's 28 toolchain failures only (917 pass), Forge typecheck and build pass, and the Chrome harness still boots and reads data.ts through the host.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds a Bitbucket Cloud pull request panel for Groma comparisons. `groma export --host-sources` writes a page without source text that links style.css (2.03 MB for HEAD~20..HEAD of this repository, against 10.7 MB of payload in the static export and the 5 MB Forge resolver limit). The published viewer reads files missing from the export through `globalThis.gromaReadSource`. integrations/bitbucket-forge holds the Forge app (resolver reading the PR, branch groma-pr-<id> and source files as the viewing user; host page mounting the stored page), a build script (scripts/build-bitbucket-forge.ts), a Pipelines template that exports from the merge base and force-pushes the page, a cleanup pipeline, an optional comment, and a README runbook with a setup.sh wizard. Verified locally: repository check (only the baseline toolchain failures), Forge typecheck and build, forge lint up to the missing app.id, pipeline script against a local origin with stubbed API, panel boot in headless Chrome with a stubbed bridge. Not verified: anything that needs a Bitbucket workspace or Forge login (CSP for data: fonts, panel height, runtime context, pipeline push). Needs a groma.md release with --host-sources before the pipeline can run.
<!-- SECTION:FINAL_SUMMARY:END -->
