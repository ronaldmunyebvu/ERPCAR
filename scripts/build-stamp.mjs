/**
 * Writes a build stamp that the deployed site serves as /version.json.
 *
 * The bundle hash is identical across server-only commits, so there was no way
 * to tell from the outside which commit a deployment actually contained.
 *
 * On Vercel there is no `.git` directory in the build sandbox and `git` may not
 * be on PATH at all, so the commit cannot be read from the checkout. An earlier
 * version of this script ran `git rev-parse` unconditionally, which failed
 * silently on Vercel and wrote `"commit": null` - a stamp that named nothing.
 * The environment variables Vercel does provide are used first, and a missing
 * commit is now reported as unknown instead of pretending to be null.
 *
 * Everything here is best-effort: a failure to stamp the build must never fail
 * the build itself.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const run = (command) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null
const fromGit = run('git rev-parse --short HEAD')
const commit = fromEnv ?? fromGit ?? 'unknown'

const branch =
  process.env.VERCEL_GIT_COMMIT_REF?.replace('refs/heads/', '') ??
  run('git rev-parse --abbrev-ref HEAD') ??
  'unknown'

const stamp = {
  commit,
  branch,
  builtAt: new Date().toISOString(),
  // `dirty` is only meaningful where git exists, so it is omitted on Vercel
  // rather than reported as a misleading false.
  ...(fromGit ? { dirty: Boolean(run('git status --porcelain')) } : {}),
  onVercel: Boolean(process.env.VERCEL),
}

mkdirSync('public', { recursive: true })
writeFileSync('public/version.json', `${JSON.stringify(stamp, null, 2)}\n`)

console.log(`[build-stamp] ${commit} (${branch})${process.env.VERCEL ? ' on Vercel' : ''}`)
