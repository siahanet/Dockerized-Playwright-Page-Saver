const minimist = require('minimist');
const { v4: uuidv4 } = require('uuid');
const { capturePage } = require('./capture');
const { createJob, getJob } = require('./jobStore');
const config = require('./config');
const { getSessionPath } = require('./sessionManager');

const args = minimist(process.argv.slice(2), {
  string: ['url', 'waitUntil', 'userAgent', 'session'],
  boolean: ['headless', 'html', 'screenshot', 'pdf', 'scroll', 'saveSession'],
  alias: {
    u: 'url',
    w: 'width',
    h: 'height',
    d: 'delay',
    t: 'timeout',
    r: 'retries'
  },
  default: {
    waitUntil: config.defaults.waitUntil,
    delay: config.defaults.delay,
    timeout: config.defaults.timeout,
    retries: config.defaults.retries,
    width: config.defaults.width,
    height: config.defaults.height,
    headless: config.defaults.headless,
    html: config.defaults.saveHtml,
    screenshot: config.defaults.saveScreenshot,
    pdf: config.defaults.savePdf,
    scroll: config.defaults.autoScroll,
    saveSession: false
  }
});

async function main() {
  if (!args.url) {
    console.error('Error: URL is required. Use --url "https://example.com"');
    process.exit(1);
  }

  const jobId = uuidv4();
  createJob(jobId, { url: args.url });

  console.log(`[CLI] Starting job ${jobId} for ${args.url}`);

  const storageStatePath = args.session ? getSessionPath(args.session) : null;

  await capturePage(jobId, {
    url: args.url,
    waitUntil: args.waitUntil,
    delay: args.delay,
    timeout: args.timeout,
    retries: args.retries,
    width: args.width,
    height: args.height,
    headless: args.headless,
    saveHtml: args.html,
    saveScreenshot: args.screenshot,
    savePdf: args.pdf,
    scroll: args.scroll,
    userAgent: args.userAgent,
    storageStatePath,
    saveStorageState: args.saveSession
  });

  const job = getJob(jobId);
  if (job.status === 'completed') {
    console.log(`[CLI] Success! Output saved to: ${job.result.folderName}`);
    process.exit(0);
  } else {
    console.error(`[CLI] Failed: ${job.error}`);
    process.exit(1);
  }
}

main();
