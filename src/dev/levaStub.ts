/*
 * Production stand-in for `leva` (the dev tweak panel). vite.config.ts aliases
 * 'leva' to this file for builds, so the panel's code never ships: useControls
 * just returns each control's default value.
 */
type Schema = Record<string, unknown>

const FOLDER = Symbol('folder')
const BUTTON = Symbol('button')

export const folder = (schema: Schema) => ({ [FOLDER]: schema })
export const button = () => ({ [BUTTON]: true })

function defaults(schema: Schema, out: Record<string, unknown> = {}) {
  for (const [key, v] of Object.entries(schema)) {
    if (v && typeof v === 'object' && FOLDER in v) defaults((v as { [FOLDER]: Schema })[FOLDER], out)
    else if (v && typeof v === 'object' && BUTTON in v) continue
    else if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) out[key] = (v as { value: unknown }).value
    else out[key] = v
  }
  return out
}

// Keyed by panel name so every render gets the same (stable) object back.
const cache = new Map<string, Record<string, unknown>>()

// Same call shapes as leva: useControls(schema) or useControls(name, schema).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useControls(a: any, b?: any): any {
  if (typeof a !== 'string') return defaults(a as Schema)
  if (!cache.has(a)) cache.set(a, defaults(b as Schema))
  return cache.get(a)
}

export const Leva = () => null
export const levaStore = { set: () => {}, get: () => undefined }
