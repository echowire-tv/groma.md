import api, { assumeTrustedRoute, route, type APIResponse, type Route } from '@forge/api'
import Resolver from '@forge/resolver'

/** Forge refuses front-end invocation responses above 5 MB. */
const RESPONSE_LIMIT = 5 * 1024 * 1024

interface PanelContext {
  workspaceId: string
  extension: { repository: { uuid: string }; pullRequest: { id: number } }
}

export type ComparisonResult =
  | { status: 'missing'; branch: string }
  | { status: 'found'; branch: string; head: string; page: string }

/** Where pipeline/groma-pipeline.mjs force-pushes each pull request's exported comparison page. */
const BRANCH_PREFIX = 'groma-pr-'
const COMPARISON_FILE = 'comparison.html'

async function read(path: Route): Promise<APIResponse | undefined> {
  const response = await api.asUser().requestBitbucket(path)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Bitbucket answered ${response.status} for ${path.value}`)
  return response
}

function limited<T>(result: T): T {
  const bytes = Buffer.byteLength(JSON.stringify(result))
  if (bytes > RESPONSE_LIMIT) {
    throw new Error(`The response is ${(bytes / 1024 / 1024).toFixed(1)} MB; Forge returns at most 5 MB to the panel`)
  }
  return result
}

/** A repository-relative file path; `.` and `..` segments would let the request leave the `src` endpoint. */
function pathSegments(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const segments = value.split('/')
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..') ? segments : undefined
}

const resolver = new Resolver()

resolver.define('getComparison', async ({ context }): Promise<ComparisonResult> => {
  const { workspaceId, extension } = context as PanelContext
  const repository = extension.repository.uuid
  const branch = `${BRANCH_PREFIX}${extension.pullRequest.id}`
  const pull = await read(route`/2.0/repositories/${workspaceId}/${repository}/pullrequests/${extension.pullRequest.id}`)
  if (pull === undefined) throw new Error('This pull request is not readable with your Bitbucket permissions')
  const head = (await pull.json() as { source: { commit: { hash: string } } }).source.commit.hash
  const ref = await read(route`/2.0/repositories/${workspaceId}/${repository}/refs/branches/${branch}`)
  if (ref === undefined) return { status: 'missing', branch }
  const commit = (await ref.json() as { target: { hash: string } }).target.hash
  const page = await read(route`/2.0/repositories/${workspaceId}/${repository}/src/${commit}/${COMPARISON_FILE}`)
  if (page === undefined) return { status: 'missing', branch }
  return limited({ status: 'found', branch, head, page: await page.text() })
})

resolver.define('getSource', async ({ context, payload }): Promise<{ source: string }> => {
  const { workspaceId, extension } = context as PanelContext
  const { commit, path } = payload as { commit?: unknown; path?: unknown }
  const segments = pathSegments(path)
  if (typeof commit !== 'string' || segments === undefined) throw new Error('Expected a commit and a repository file path')
  // `route` refuses a value containing `/`; the checked, encoded path goes in as a nested route.
  const file = assumeTrustedRoute(segments.map(encodeURIComponent).join('/'))
  const response = await read(route`/2.0/repositories/${workspaceId}/${extension.repository.uuid}/src/${commit}/${file}`)
  if (response === undefined) throw new Error(`${path} does not exist at ${commit.slice(0, 12)}`)
  return limited({ source: await response.text() })
})

export const handler = resolver.getDefinitions()
