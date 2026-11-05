import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const SOURCE = /\.(?:js|mjs|cjs|jsx)$/

/** One listed file with its syntax tree. */
export interface JavaScriptSource {
  /** The path Groma listed. A fact names the file by this path. */
  file: string
  /**
   * The file's syntax tree. Its `fileName` is the parser's own spelling of the path, in which a backslash is a
   * slash: that name may not exist on disk, or may be another listed file, so a fact does not name the file by it.
   */
  syntax: ts.SourceFile
}

/** The program a `#!` line runs: its interpreter, or the command `env` starts after its options and assignments. */
function shebangProgram(text: string): string | undefined {
  if (!text.startsWith('#!')) return undefined
  const end = text.indexOf('\n')
  const [interpreter, ...rest] = text.slice(2, end === -1 ? undefined : end).trim().split(/\s+/)
  if (interpreter === undefined) return undefined
  if (path.posix.basename(interpreter) !== 'env') return path.posix.basename(interpreter)
  const program = rest.find(word => !word.startsWith('-') && !word.includes('='))
  return program === undefined ? undefined : path.posix.basename(program)
}

/**
 * The JavaScript sources among a scanner's files: those with a JavaScript extension, and extensionless scripts that
 * Node.js runs, such as an npm `bin` or a `bin/www` launcher.
 */
export async function javaScriptFiles(root: string, files: readonly string[]): Promise<string[]> {
  const selected: string[] = []
  for (const file of files) {
    if (SOURCE.test(file)) selected.push(file)
    else if (path.posix.extname(file) === '' && shebangProgram(await readFile(path.join(root, file), 'utf8')) === 'node') {
      selected.push(file)
    }
  }
  return selected
}

/**
 * TypeScript takes a file's language from its extension, and a program refuses a root file without a supported one,
 * so a file without an extension is parsed under its name plus `.js`.
 */
export function parseJavaScript(fileName: string, text: string): ts.SourceFile {
  const name = path.extname(fileName) === '' ? `${fileName}.js` : fileName
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true)
}

/** Each JavaScript source among the files, parsed alone, so no project configuration, dependency or build tool is needed. */
export async function javaScriptSources(root: string, files: readonly string[]): Promise<JavaScriptSource[]> {
  const sources: JavaScriptSource[] = []
  for (const file of await javaScriptFiles(root, files)) {
    sources.push({ file, syntax: parseJavaScript(file, await readFile(path.join(root, file), 'utf8')) })
  }
  return sources
}
