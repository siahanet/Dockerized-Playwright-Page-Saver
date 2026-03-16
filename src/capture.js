const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { sanitizeName, getTimestamp, ensureDir } = require('./utils');
const { saveAssets } = require('./assetSaver');
const { updateJob } = require('./jobStore');

async function autoScroll(page, log) {
  log('Starting robust auto-scroll...');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          // Scroll back to top
          window.scrollTo(0, 0);
          resolve();
        }
      }, 200);
    });
  });
  log('Auto-scroll finished.');
}

async function capturePage(jobId, options) {
  const {
    url,
    outputBaseDir = 'outputs',
    waitUntil = 'networkidle',
    delay = 3000,
    timeout = 60000,
    retries = 1,
    width = 1440,
    height = 900,
    headless = true,
    saveHtml = true,
    saveScreenshot = true,
    savePdf = false,
    scroll = true,
    userAgent = null,
    storageStatePath = null,
    saveStorageState = false
  } = options;

  const log = (msg) => {
    console.log(`[Job ${jobId}] ${msg}`);
    updateJob(jobId, { log: msg });
  };

  log(`Starting capture for: ${url}`);

  let browser;
  let attempt = 0;
  let success = false;
  let lastError;
  let startTime = Date.now();

  while (attempt <= retries && !success) {
    if (attempt > 0) log(`Retry attempt ${attempt}...`);
    
    try {
      browser = await chromium.launch({ headless, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      
      const contextOptions = {
        viewport: { width, height },
        userAgent: userAgent || undefined
      };

      if (storageStatePath && fs.existsSync(storageStatePath)) {
        log(`Loading storage state from: ${storageStatePath}`);
        contextOptions.storageState = storageStatePath;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      const requests = [];
      const networkLog = new Map(); // absoluteUrl -> { content: Buffer|string, contentType: string }
      
      page.on('request', request => {
        requests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType()
        });
      });

      page.on('response', async response => {
        const url = response.url();
        const resourceType = response.request().resourceType();
        const status = response.status();

        // We only care about successful responses for relevant types
        if (status >= 200 && status < 300) {
          const relevantTypes = ['script', 'stylesheet', 'image', 'font', 'fetch', 'xhr'];
          if (relevantTypes.includes(resourceType)) {
            try {
              // Only capture same-origin or relevant external assets to avoid massive memory usage
              const isSameOrigin = new URL(url).origin === new URL(options.url).origin;
              const isStaticAsset = ['script', 'stylesheet', 'image', 'font'].includes(resourceType);
              
              if (isSameOrigin || isStaticAsset) {
                const buffer = await response.body();
                networkLog.set(url, {
                  content: buffer,
                  contentType: response.headers()['content-type'] || '',
                  resourceType
                });
              }
            } catch (e) {
              // Some responses might not have a body or fail to read
            }
          }
        }
      });

      const failedRequests = [];
      page.on('requestfailed', request => {
        failedRequests.push({
          url: request.url(),
          error: request.failure().errorText
        });
      });

      const consoleLogs = [];
      page.on('console', msg => {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      });

      log(`Navigating to ${url}...`);
      const response = await page.goto(url, { waitUntil, timeout });
      
      if (!response) {
        throw new Error('No response received from page.');
      }

      if (scroll) {
        await autoScroll(page, log);
      }

      if (delay > 0) {
        log(`Waiting for extra delay: ${delay}ms`);
        await page.waitForTimeout(delay);
      }

      const finalUrl = page.url();
      const title = await page.title();
      const hostname = new URL(url).hostname;
      const folderName = `${getTimestamp()}_${sanitizeName(hostname)}`;
      const outputDir = path.join(process.cwd(), outputBaseDir, folderName);
      ensureDir(outputDir);

      log(`Saving outputs to ${folderName}...`);

      const metadata = {
        jobId,
        originalUrl: url,
        finalUrl,
        title,
        timestamp: new Date().toISOString(),
        viewport: { width, height },
        waitUntil,
        extraDelay: delay,
        timeout,
        retriesUsed: attempt,
        headless,
        scroll,
        userAgent: userAgent || (await page.evaluate(() => navigator.userAgent)),
        storageStateUsed: storageStatePath ? path.basename(storageStatePath) : null,
        files: {}
      };

      if (saveHtml) {
        log('Capturing and localizing HTML...');
        const rawHtml = await page.content();
        const { localizedHtml, manifest } = await saveAssets(page, rawHtml, outputDir, finalUrl, networkLog);
        fs.writeFileSync(path.join(outputDir, 'page.html'), localizedHtml);
        metadata.files.html = 'page.html';
        
        // Save network summary with localization info
        fs.writeFileSync(path.join(outputDir, 'network-summary.json'), JSON.stringify({
          totalRequests: requests.length,
          failedRequests: failedRequests.length,
          failedDetails: failedRequests,
          localizedAssets: manifest
        }, null, 2));
        metadata.files.networkSummary = 'network-summary.json';
      }

      if (saveScreenshot) {
        log('Capturing full-page screenshot...');
        await page.screenshot({ path: path.join(outputDir, 'screenshot.png'), fullPage: true });
        metadata.files.screenshot = 'screenshot.png';
      }

      if (savePdf && headless) {
        log('Capturing PDF...');
        await page.pdf({ path: path.join(outputDir, 'page.pdf'), format: 'A4', printBackground: true });
        metadata.files.pdf = 'page.pdf';
      }

      if (saveStorageState) {
        const newStatePath = path.join(outputDir, 'storage-state.json');
        await context.storageState({ path: newStatePath });
        metadata.files.storageState = 'storage-state.json';
        log('Storage state saved.');
      }

      fs.writeFileSync(path.join(outputDir, 'console.log'), consoleLogs.join('\n'));
      metadata.files.consoleLog = 'console.log';

      metadata.captureDuration = Date.now() - startTime;
      fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      log('Capture successful.');
      updateJob(jobId, { status: 'completed', progress: 100, result: { folderName, metadata } });
      success = true;

    } catch (err) {
      lastError = err;
      log(`Error: ${err.message}`);
      attempt++;
    } finally {
      if (browser) await browser.close();
    }
  }

  if (!success) {
    log(`Capture failed after ${retries + 1} attempts.`);
    updateJob(jobId, { status: 'failed', error: lastError.message });
  }
}

module.exports = { capturePage };
