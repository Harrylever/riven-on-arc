import { createServices } from './container';
import { createApp } from './app';
import { startJobs } from './jobs';
import { Logger } from './lib/logger';
import { startSakzRunner } from './arc/sakz-runner';

const logger = new Logger('Bootstrap');
const services = createServices();
const app = createApp(services);
// DISABLE_JOBS=true runs an API-only instance (e.g. a second replica, or a smoke test).
const jobs = process.env.DISABLE_JOBS === 'true' ? [] : startJobs(services);
const port = Number(process.env.PORT ?? 3000);

logger.log(`Listening on :${port}, ${jobs.length} cron jobs scheduled`);
// sakz-bot's perp scanner runs alongside (when SAKZ_DIR is set) so signals flow on their own.
if (process.env.DISABLE_JOBS !== 'true') {
  const sakz = startSakzRunner();
  if (!sakz.started) logger.log(`Perp scanner not started: ${sakz.reason}`);
}

// Stop schedulers on deploy/restart so an in-flight tick isn't cut mid-write
// by the process dying under it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    jobs.forEach((j) => j.stop());
    process.exit(0);
  });
}

// Bun serves the default export.
export default { port, fetch: app.fetch };
