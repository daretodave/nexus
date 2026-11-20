// scripts/plan/secrets-manifest.mjs: nexus.secrets.json, the tracked contract that names a repo's secrets.
//
// The rule: the model sees names, never values. The manifest holds one entry per secret (its name, what it is for,
// where to get it, where it goes, who provides it, the chunk that first asked for it, and optionally `optional: true`
// for one the repo runs without) and never a value: a
// `value` key is refused outright, so is any key the shape doesn't name. Values live in the vault (local, untracked);
// the manifest is what the plan, the gate and the GUI read. Shape, rules and the import:
// nexus/customization/secrets.md.
//
//   {
//     "version": 1,
//     "secrets": [
//       { "name": "VERCEL_TOKEN", "for": "Deploys the site.", "where": "https://vercel.com/account/tokens",
//         "destinations": ["local", "github-actions"], "provider": "owner", "chunk": "07.3" }
//     ]
//   }
//
// An import builds entries from a .env.example (or any .env-shaped file): its names, commented out or not, and its
// comments for `for` and `where`. A value on the line is skipped, never read into the result. Pure functions, no
// dependencies; plan-check imports the parser, scripts/secrets.mjs is the command line.
import fs from 'node:fs'

export const MANIFEST = 'nexus.secrets.json'
export const VERSION = 1
/** Where a secret's value may be pushed. `local` is the vault itself; each other one has a sink in
 * scripts/secrets-sinks.mjs (cloudflare is a Worker; the rest are named for the place). */
export const DESTINATIONS = ['local', 'github-actions', 'vercel', 'cloudflare', 'cloudflare-pages', 'netlify', 'fly', 'supabase', 'firebase',
  'aws-secrets-manager', 'aws-ssm', 'gcp-secret-manager', 'azure-key-vault']
/** Who provides the value. The owner is the sysadmin; contributors never need project secrets. */
export const PROVIDERS = ['owner']
/** An environment variable's name, as a chunk line and the manifest write it. */
export const NAME = /^[A-Z][A-Z0-9_]*$/
const KEYS = ['name', 'for', 'where', 'destinations', 'provider', 'chunk']
/** Keys an entry may carry besides KEYS: `optional` (true: unset reads "optional · not set", never missing). */
const OPTIONAL_KEYS = ['optional']
const TOP_KEYS = ['version', 'about', 'secrets']
const CHUNK_ID = /^\d{2,}\.\d+[a-z0-9]*$/
const LINK = /^https?:\/\/\S+$/

export const emptyManifest = () => ({ version: VERSION, secrets: [] })

/** The shape's problems, one line each. A problem never quotes a value: it names the entry, never what it holds. */
export function validateManifest(m) {
  const problems = []
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['the manifest is a JSON object: { "version": 1, "secrets": [...] }']
  for (const k of Object.keys(m)) if (!TOP_KEYS.includes(k)) problems.push(`unknown top-level key ${k} (the shape: ${TOP_KEYS.join(', ')})`)
  if (m.version !== VERSION) problems.push(`version: ${VERSION} (the only shape there is)`)
  if (m.about !== undefined && typeof m.about !== 'string') problems.push('about: a line of text, or leave it out')
  if (!Array.isArray(m.secrets)) return [...problems, 'secrets: a list of entries (empty is fine)']
  const seen = new Set()
  m.secrets.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) { problems.push(`secrets[${i}]: an entry is an object`); return }
    const who = typeof e.name === 'string' && e.name ? e.name : `secrets[${i}]`
    if (!NAME.test(e.name ?? '')) problems.push(`${who}: not an env-var name (A-Z, 0-9 and _, starting with a letter)`)
    else if (seen.has(e.name)) problems.push(`${who}: declared twice`)
    else seen.add(e.name)
    for (const k of Object.keys(e)) {
      if (k === 'value' || k === 'values') problems.push(`${who}: a manifest never holds a value (values live in the vault)`)
      else if (!KEYS.includes(k) && !OPTIONAL_KEYS.includes(k)) problems.push(`${who}: unknown key ${k} (an entry has ${KEYS.join(', ')}, and optionally ${OPTIONAL_KEYS.join(', ')})`)
    }
    if (typeof e.for !== 'string' || !e.for.trim()) problems.push(`${who}: for: say what it is for`)
    if (e.where !== null && !(typeof e.where === 'string' && LINK.test(e.where))) problems.push(`${who}: where: a link (https://…) or null`)
    if (!Array.isArray(e.destinations) || e.destinations.length === 0) problems.push(`${who}: destinations: name at least one (${DESTINATIONS.join(', ')})`)
    else {
      for (const d of e.destinations) if (!DESTINATIONS.includes(d)) problems.push(`${who}: destination ${d} is not one of ${DESTINATIONS.join(', ')}`)
      if (new Set(e.destinations).size !== e.destinations.length) problems.push(`${who}: destinations: each once`)
    }
    if (!PROVIDERS.includes(e.provider)) problems.push(`${who}: provider ${e.provider} is not one of ${PROVIDERS.join(', ')}`)
    if (e.chunk !== null && !(typeof e.chunk === 'string' && CHUNK_ID.test(e.chunk))) problems.push(`${who}: chunk: a chunk id (NN.k) or null`)
    if (e.optional !== undefined && typeof e.optional !== 'boolean') problems.push(`${who}: optional: true or false, or leave it out`)
  })
  return problems
}

/** Parse a manifest's text: { manifest, names, problems }. `names` holds every well-formed name, even when the
 * manifest has other problems, so a reader can still say which names are declared. */
export function parseManifest(text) {
  let manifest
  try { manifest = JSON.parse(text) } catch (err) { return { manifest: null, names: new Set(), problems: [`not JSON (${err.message.split('\n')[0]})`] } }
  const problems = validateManifest(manifest)
  const list = manifest && Array.isArray(manifest.secrets) ? manifest.secrets : []
  const names = new Set(list.map((e) => e && e.name).filter((n) => typeof n === 'string' && NAME.test(n)))
  return { manifest, names, problems }
}

/** Read a manifest file: null when there is none, else parseManifest's result. */
export function readManifest(file) {
  let text
  try { text = fs.readFileSync(file, 'utf-8') } catch (err) { if (err.code === 'ENOENT') return null; throw err }
  return parseManifest(text)
}

/** The manifest as written: two-space JSON, one trailing newline, each entry's keys in the documented order
 * (`optional` last, and only when true). */
export function serialize(m) {
  const secrets = m.secrets.map((e) => ({ ...Object.fromEntries(KEYS.map((k) => [k, e[k] ?? null])), ...(e.optional === true ? { optional: true } : {}) }))
  return `${JSON.stringify({ ...m, secrets }, null, 2)}\n`
}

const ASSIGN = /^\s*(#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*)=(.*)$/
const URL_IN = /https?:\/\/[^\s)>\]]+/
const BANNER = /^[\s=\-_*#~]*$|^\s*(?:-{3,}|={3,})/
const FOR_MAX = 200

// What follows `=`: the value is skipped (quoted, or up to whitespace + #) and only a trailing comment is returned.
function trailingComment(rest) {
  const s = rest.trimStart()
  if (s[0] === '"' || s[0] === "'") {
    const close = s.indexOf(s[0], 1)
    if (close === -1) return ''
    const after = s.slice(close + 1)
    const hash = after.indexOf('#')
    return hash === -1 ? '' : after.slice(hash + 1).trim()
  }
  const m = /(^|\s)#(.*)$/.exec(s)
  return m ? m[2].trim() : ''
}

function prose(text) {
  const t = text.replace(URL_IN, '').replace(/\s+/g, ' ').trim()
  return t.length > FOR_MAX ? `${t.slice(0, FOR_MAX - 1).replace(/\s+\S*$/, '')}…` : t
}

/**
 * Entries from a .env.example's text: [{ name, for, where }], each name once, in file order. A name counts whether
 * its line is live (`NAME=`) or commented out (`# NAME=`, no space before the `=`). `for` is the line's trailing
 * comment, else the comment block just above it (a blank line, an empty `#` or a banner ends a block); `where` is the
 * first link in either. Values are never read into the result.
 */
export function importEnvExample(text) {
  const out = []
  const seen = new Set()
  let block = []
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    const a = ASSIGN.exec(line)
    const commented = a && a[1]
    if (a && !(commented && a[3]) && NAME.test(a[2])) {
      const name = a[2]
      if (!seen.has(name)) {
        seen.add(name)
        const tail = trailingComment(a[4])
        const above = block.join(' ')
        const where = (URL_IN.exec(tail) || URL_IN.exec(above) || [null])[0]
        const words = prose(tail) || prose(above)
        out.push({ name, for: words || `${name} (imported from .env.example: say what it is for)`, where })
      }
      block = []
      continue
    }
    if (a && !commented) { block = []; continue }
    if (!line.startsWith('#')) { block = []; continue }
    const body = line.replace(/^#+/, '').trim()
    if (!body || BANNER.test(body)) { block = []; continue }
    block.push(body)
  }
  return out
}

/** Add imported entries to a manifest. An entry already there is kept exactly as written; a new one goes to `local`,
 * provided by the owner, asked for by no chunk yet. Returns { manifest, added, kept } (names). */
export function mergeImport(manifest, imported) {
  const m = { ...manifest, secrets: [...manifest.secrets] }
  const have = new Set(m.secrets.map((e) => e.name))
  const added = []
  const kept = []
  for (const e of imported) {
    if (have.has(e.name)) { kept.push(e.name); continue }
    have.add(e.name)
    added.push(e.name)
    m.secrets.push({ name: e.name, for: e.for, where: e.where, destinations: ['local'], provider: 'owner', chunk: null })
  }
  return { manifest: m, added, kept }
}
