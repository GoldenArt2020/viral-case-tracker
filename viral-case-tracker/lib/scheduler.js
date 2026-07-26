const cron = require('node-cron');
const { runResearch } = require('./runResearch');

function startScheduler() {
  const expr = process.env.RESEARCH_CRON || '0 8 * * *';

  if (!cron.validate(expr)) {
    console.error(`Invalid RESEARCH_CRON expression "${expr}" — scheduler not started.`);
    return;
  }

  cron.schedule(expr, async () => {
    console.log(`[scheduler] Running research at ${new Date().toISOString()}`);
    const result = await runResearch();
    if (result.ok) {
      console.log(`[scheduler] Found ${result.cases.length} candidate case(s).`);
    } else {
      console.error(`[scheduler] Research run failed: ${result.error}`);
    }
  });

  console.log(`[scheduler] Research will run on schedule: "${expr}"`);
}

module.exports = { startScheduler };
