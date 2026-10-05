/**
 * Deployment diagnostic. Deliberately imports nothing.
 *
 * A request to `/api/health` must return immediately on any healthy deployment.
 * If it times out, the problem is the build or the function runtime rather than
 * any database code, because nothing here touches the network or a driver.
 *
 * The commit hash and start time make it possible to confirm which deployment a
 * request was served by.
 */
// Recorded at module load, so a response reveals whether the instance was
// freshly booted or reused from a warm pool.
const loadedAt = new Date().toISOString()

export default function handler() {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify({
      ok: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      region: process.env.VERCEL_REGION ?? null,
      node: process.version,
      loadedAt,
      now: new Date().toISOString(),
    }),
  }
}
