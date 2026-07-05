// scripts/stack-lifecycle.mjs
//
// Generic mechanics for Pattern B hermetic e2e (a stack with
// stateful dependencies) — see nexus/customization/hermetic-e2e.md.
// The spawn command, ports, and DB seeding stay project-specific;
// your own `up`/`down` scripts import these four functions instead
// of reimplementing port probing, health polling, and state-file
// bookkeeping from scratch.
//
//   import {
//     isPortInUse, waitForHealth, readState, writeState, isStackHealthy,
//   } from './stack-lifecycle.mjs'
//
// Zero dependencies, ESM, Node >=18.

import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

// Resolves true/false; never throws. A refused connection means the
// port is free, which is the common case and not an error.
export function isPortInUse(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

// Polls `url` until it responds with a status under 500, or throws
// once `timeoutMs` elapses. Poll the path that depends on every
// subsystem you care about, not `/` — see hermetic-e2e.md's ranked
// flake causes.
export async function waitForHealth(url, { timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
      lastError = new Error(`${url} responded ${res.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `stack-lifecycle: ${url} never became healthy within ${timeoutMs}ms (last: ${lastError?.message})`,
  )
}

// `.runtime/state.json` convention — what `up` spawned, so `down`
// tears down only that, and so a second `up` can detect and attach
// to an already-healthy stack instead of spawning a duplicate.
export function readState(runtimeDir) {
  const file = path.join(runtimeDir, 'state.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

export function writeState(runtimeDir, state) {
  fs.mkdirSync(runtimeDir, { recursive: true })
  fs.writeFileSync(path.join(runtimeDir, 'state.json'), JSON.stringify(state, null, 2))
}

// True iff the process the state file tracks is still alive AND its
// tracked URL answers health. Either alone is a false positive: a
// live pid serving a 500 isn't healthy, and a dead pid whose port was
// picked up by an unrelated squatter must not be reported as our
// stack running.
export async function isStackHealthy(state) {
  if (!state?.pid || !state?.urls?.service) return false
  try {
    process.kill(state.pid, 0)
  } catch {
    return false
  }
  try {
    const res = await fetch(`${state.urls.service}/health`)
    return res.status < 500
  } catch {
    return false
  }
}
