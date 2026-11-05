import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { pageStyle } from '../src/viewers/web/page.ts'
import { bundleRenderer } from '../src/viewers/web/runtime.ts'

/** Writes the Forge Custom UI resource: the panel host page plus this repository's published viewer. */
const app = path.resolve(import.meta.dir, '../integrations/bitbucket-forge')
const panel = path.join(app, 'panel')
const output = path.join(app, 'static')

const host = await Bun.build({ entrypoints: [path.join(panel, 'host.ts')], target: 'browser', minify: true })
if (!host.success) throw new AggregateError(host.logs, 'The panel host script did not build')

await rm(output, { recursive: true, force: true })
await mkdir(output)
await Promise.all([
  copyFile(path.join(panel, 'index.html'), path.join(output, 'index.html')),
  copyFile(path.join(panel, 'host.css'), path.join(output, 'host.css')),
  writeFile(path.join(output, 'host.js'), await host.outputs[0]!.text()),
  writeFile(path.join(output, 'render.js'), await bundleRenderer()),
  writeFile(path.join(output, 'style.css'), pageStyle),
  // The published viewer polls version.js for re-exports; an empty script answers without an error.
  writeFile(path.join(output, 'version.js'), ''),
])
console.log(`Forge resource at ${output}`)
