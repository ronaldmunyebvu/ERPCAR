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
      // Whether the required environment arrived. Reported by name only, so a
      // secret is never echoed back in a response body.
      env: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        JWT_SECRET: Boolean(process.env.JWT_SECRET),
        SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
        VITE_DATA_SOURCE: process.env.VITE_DATA_SOURCE ?? null,
      },
    }),
  }
}
