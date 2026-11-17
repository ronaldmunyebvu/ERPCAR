/**
 * Manual trigger for the daily fleet-reminder job.
 *
 *   npm run reminders:check
 *
 * The same code path runs on Vercel Cron at 06:00 UTC. Requires DATABASE_URL
 * and the MAIL_USER / MAIL_APP_PASSWORD pair in `.env`; without the mail pair
 * the run reports that it was skipped instead of failing.
 */
import { runReminders } from '../api/_lib/handler-reminders.js'

try {
  const summary = await runReminders()
  console.log(JSON.stringify(summary, null, 2))
  if (summary.failed) process.exitCode = 1
} catch (error) {
  console.error('[reminders] run failed', error)
  process.exitCode = 1
}
