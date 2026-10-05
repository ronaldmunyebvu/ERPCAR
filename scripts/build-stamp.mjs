/**
 * Writes a build stamp that the deployed site serves as /version.json.
 *
 * The bundle hash is identical across server-only commits, so there was no way
 * to tell from the outside which commit a deployment actually contained. This
 * makes that verifiable: the file's contents name the exact commit and whether
 * the build looked like a CI build or a local one.
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

const commit = run('git rev-parse --short HEAD')
const branch = run('git rev-parse --abbrev-ref HEAD')
const builtAt = new Date().toISOString()

mkdirSync('public', { recursive: true })
writeFileSync(
  'public/version.json',
  `${JSON.stringify({ commit, branch, builtAt, dirty: Boolean(run('git status --porcelain')) }, null, 2)}\n`,
)

console.log(`[build-stamp] ${commit ?? 'unknown'} (${branch ?? 'unknown'}) at ${builtAt}`)
