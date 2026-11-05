---
type: C4 Component
title: Bitbucket pull request panel
status: stable
groma:
  id: bitbucket-panel
  parent: export
  code:
    - scanner: typescript
      file: integrations/bitbucket-forge/src/index.ts
    - scanner: typescript
      file: integrations/bitbucket-forge/panel/host.ts
  technology: Forge Custom UI, TypeScript
description: Shows a stored comparison export in Bitbucket Cloud pull requests
---

A Forge app on the pull request Overview tab. Its resolver reads the pull request, the comparison page the pipeline stored on branch groma-pr-<id>, and source files, all as the viewing user. The host page mounts the stored page, supplies source files to the published viewer through gromaReadSource, and loads the browser map.
