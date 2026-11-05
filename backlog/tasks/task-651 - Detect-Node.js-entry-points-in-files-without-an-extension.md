---
id: TASK-651
title: Detect Node.js entry points in files without an extension
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T13:46:00Z'
updated_date: '2026-11-05T13:53:00Z'
labels: []
dependencies: []
references:
  - plugins/scanners/javascript/src/sources.ts
  - plugins/scanners/entry-points/javascript.ts
modified_files:
  - plugins/scanners/javascript/src/sources.ts
  - plugins/scanners/javascript/src/index.ts
  - plugins/scanners/javascript/src/outline.ts
  - plugins/scanners/entry-points/javascript.ts
  - test-bun/execution-evidence.test.ts
  - docs/scanners/javascript/index.md
ordinal: 707000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Node.js application commonly starts from an extensionless script with a node shebang, such as bin/www or bin/live, run by pm2 or a package script (node bin/live). The JavaScript scanner reads only .js, .mjs, .cjs and .jsx files, and a package script counts as an entry only when it names a file with one of those extensions. Such an application therefore gets no execution entry, so no container, and every component lands in the Unidentified container group. Found on vectormax/live, whose entry is bin/live.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A file the javascript scanner's include list selects, that has no extension and whose first line is a node shebang, is scanned as a JavaScript source; an extensionless file without one is not
- [x] #2 A package script that runs a runtime on a path containing a slash, such as node bin/live, reports that file as an execution entry; a bare word such as the build in bun build still reports none
- [x] #3 A scan of a project whose start script runs an extensionless shebang file creates a container holding the files that file requires
- [x] #4 The JavaScript scanner documentation says how to include such a file
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
1. sources.ts: a listed file without an extension is a JavaScript source when its #! line runs node (directly or through env). It is parsed under its name plus .js: TypeScript takes the language from the extension, and the HTTP readers' single-file program refuses a root without one, which crashed the checker on vectormax/live's bin/live. listSourceFiles, checkReadiness and the outline reader use the same rule.
2. entry-points/javascript.ts: a runtime's script argument is a file with a JS/TS extension or any path containing a slash; a bare word stays a subcommand.
3. Test in test-bun/execution-evidence.test.ts: shebang selection, the extensionless start-script entry and its container, and the callback shape that crashed the checker.
4. Document in docs/scanners/javascript/index.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: test-bun/execution-evidence.test.ts fails without the change and passes with it; the 7 Bun test files that use the JavaScript scanner pass (134 pass, 0 fail); typecheck passes; biome reports only the existing warning at execution-evidence.test.ts:150. On a copy of vectormax/live with start set to node bin/live and bin/live in the include list, groma.md 0.7.8 with this scanner build places 76 of 78 components in one container; the two outside are ecosystem.config.js and models/pgHelper.js, which bin/live does not reach. A later scan with the released scanner 0.2.3 keeps that placement.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The JavaScript scanner reads an included extensionless file whose #! line runs node, and a package script such as node bin/live counts as an execution entry, so a Node.js service started from bin/www or bin/live gets an application container. Such a file is parsed under a .js name, because the single-file TypeScript program behind the HTTP readers refuses a root without an extension. A project must add the file to the scanner's include list; no glob selects extensionless files.
<!-- SECTION:FINAL_SUMMARY:END -->
