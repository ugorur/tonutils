import { normalizePath, type SourceFile } from '~/lib/compilers/files'
import { convertFunCToTolk } from '~/lib/compilers/vendor/convert-to-tolk.js'
import { initFunCParserOnce } from '~/lib/compilers/vendor/parse-func-source.js'

// Thin wrapper around the official converter, @ton/convert-func-to-tolk 1.0.0 (vendored in app/lib/compilers/vendor).

export interface ConvertOptions {
  /** snake_case function names -> camelCase (converter default: on). */
  camelCaseFunctions: boolean
  /** snake_case locals and parameters -> camelCase (converter default: on). */
  camelCaseLocals: boolean
  /** Also insert each warning as a comment in the output. */
  warningsAsComments: boolean
}

export const DEFAULT_OPTIONS: ConvertOptions = { camelCaseFunctions: true, camelCaseLocals: true, warningsAsComments: false }

export interface ConvertWarning { line: number, col: number, text: string }

export type ConvertedFile =
  | { from: string, path: string, kind: 'converted', content: string, warnings: ConvertWarning[] }
  /** stdlib.fc is not converted: Tolk has its own standard library and the converter drops `#include "stdlib.fc"`. */
  | { from: string, path: string, kind: 'stdlib' }
  | { from: string, path: string, kind: 'error', error: string }

/** Load the tree-sitter runtime and FunC grammar (both WASM, ~260 KB). Safe to call repeatedly. */
export const initConverter = (treeSitterWasm: Uint8Array, funcGrammarWasm: Uint8Array) => initFunCParserOnce(treeSitterWasm, funcGrammarWasm)

export const isStdlibPath = (path: string) => /(^|\/)stdlib\.(fc|func)$/.test(normalizePath(path))

/** `contracts/jetton-minter.fc` -> `contracts/jetton-minter.tolk` (the converter rewrites includes the same way). */
export const tolkPath = (path: string) => normalizePath(path).replace(/\.(fc|func)$/, '') + '.tolk'

/**
 * The converter writes `tolk 1.0` at the top, and Tolk refuses a version line from another compiler version.
 * Point it at the compiler we check with (e.g. `1.5.0`).
 */
export const fixVersionLine = (src: string, tolkVersion: string) => src.replace(/^tolk \d+\.\d+(\.\d+)?[ \t]*$/m, `tolk ${tolkVersion}`)

export function convertFile(file: SourceFile, opts: ConvertOptions, tolkVersion?: string): ConvertedFile {
  const path = tolkPath(file.path)
  if (isStdlibPath(file.path)) return { from: file.path, path, kind: 'stdlib' }
  try {
    const r = convertFunCToTolk(file.content, {
      shouldInsertWarningsAsComments: opts.warningsAsComments,
      transformFunctionNamesToCamelCase: opts.camelCaseFunctions,
      transformLocalVarNamesToCamelCase: opts.camelCaseLocals
    })
    return {
      from: file.path,
      path,
      kind: 'converted',
      content: tolkVersion ? fixVersionLine(r.tolkSource, tolkVersion) : r.tolkSource,
      warnings: r.warnings.map(w => ({ line: w.lineNo, col: w.colNo, text: w.text }))
    }
  }
  catch (e) {
    return { from: file.path, path, kind: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

export const convertProject = (files: SourceFile[], opts: ConvertOptions, tolkVersion?: string) => files.map(f => convertFile(f, opts, tolkVersion))

/** Converted files as a Tolk project (stdlib and failed files left out); the first converted file is the entrypoint. */
export const tolkFiles = (out: ConvertedFile[]): SourceFile[] =>
  out.flatMap(f => (f.kind === 'converted' ? [{ path: f.path, content: f.content }] : []))
