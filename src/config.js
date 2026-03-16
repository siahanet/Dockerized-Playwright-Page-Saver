require('dotenv').config();

const config = {
  port: process.env.PORT || 38473,
  outputDir: process.env.OUTPUT_DIR || 'outputs',
  sessionsDir: process.env.SESSIONS_DIR || 'sessions',
  defaults: {
    waitUntil: 'networkidle',
    delay: 3000,
    timeout: 60000,
    retries: 1,
    width: 1440,
    height: 900,
    headless: true,
    saveHtml: true,
    saveScreenshot: true,
    savePdf: false,
    autoScroll: true
  }
};

module.exports = config;
