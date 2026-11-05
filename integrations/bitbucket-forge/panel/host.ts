import { invoke } from '@forge/bridge'
import type { ComparisonResult } from '../src/index.ts'

declare global {
  /** Copy of the contract in src/viewers/web/payload.ts; this package does not compile Groma's sources. */
  var gromaReadSource: ((file: string, commit: string) => Promise<{ source: string }>) | undefined
}

/** Without metadata in the request, Forge returns the resolver's value unwrapped. */
async function call<T>(name: string, payload?: { commit: string; path: string }): Promise<T> {
  return await invoke<T>(name, payload) as T
}

function notice(text: string, className = ''): HTMLElement {
  const element = document.createElement('p')
  element.id = 'panel-notice'
  element.className = className
  element.textContent = text
  return element
}

function show(text: string): void {
  document.body.replaceChildren(notice(text))
}

/** The exported page's own head and scripts stay out: this page links style.css and loads render.js itself. */
function mount(page: Document): void {
  for (const script of page.body.querySelectorAll('script[src]')) script.remove()
  document.title = page.title
  for (const attribute of page.body.attributes) document.body.setAttribute(attribute.name, attribute.value)
  document.body.replaceChildren(...page.body.childNodes)
}

async function open(): Promise<void> {
  const result = await call<ComparisonResult>('getComparison')
  if (result.status === 'missing') {
    show(`No architecture comparison yet. The pull request pipeline writes it to branch ${result.branch}.`)
    return
  }
  const page = new DOMParser().parseFromString(result.page, 'text/html')
  const world = page.getElementById('world')?.textContent
  if (!world) throw new Error(`Branch ${result.branch} does not hold a Groma comparison page`)
  const revision = (JSON.parse(world) as { revision: { id: string } | null }).revision?.id ?? ''
  mount(page)
  if (!revision.startsWith(result.head)) {
    document.body.append(notice('This comparison is for an earlier commit of the pull request.', 'over-map'))
  }
  globalThis.gromaReadSource = (file, commit) => call('getSource', { commit, path: file })
  const renderer = document.createElement('script')
  renderer.src = './render.js'
  document.body.append(renderer)
}

open().catch((error: unknown) => show(error instanceof Error ? error.message : String(error)))
