const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./utils');

async function saveAssets(page, html, outputDir, baseUrl) {
  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const downloadedAssets = new Map();
  let localizedHtml = html;

  // Simple regex-based asset extraction (best effort)
  // In a real production app, we might use a proper HTML parser like cheerio
  // but for this project we'll stick to a robust enough regex or Playwright's own evaluation
  
  const assetTags = [
    { regex: /src=["'](?!data:)([^"']+)["']/gi, attr: 'src' },
    { regex: /href=["'](?!data:)([^"']+\.(css|png|jpg|jpeg|gif|svg|webp|ico))["']/gi, attr: 'href' }
  ];

  const urlsToDownload = [];
  
  for (const tag of assetTags) {
    let match;
    while ((match = tag.regex.exec(html)) !== null) {
      const originalUrl = match[1];
      try {
        const absoluteUrl = new URL(originalUrl, baseUrl).href;
        if (!downloadedAssets.has(absoluteUrl)) {
          urlsToDownload.push({ originalUrl, absoluteUrl });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
  }

  console.log(`[ASSETS] Found ${urlsToDownload.length} potential assets to localize.`);

  for (const { originalUrl, absoluteUrl } of urlsToDownload) {
    if (downloadedAssets.has(absoluteUrl)) continue;

    try {
      const urlObj = new URL(absoluteUrl);
      const ext = path.extname(urlObj.pathname) || '.bin';
      const filename = `${Math.random().toString(36).slice(2, 10)}${ext}`;
      const filePath = path.join(assetsDir, filename);

      const response = await axios({
        method: 'get',
        url: absoluteUrl,
        responseType: 'stream',
        timeout: 5000
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const localPath = `assets/${filename}`;
      downloadedAssets.set(absoluteUrl, localPath);
      
      // Escape special characters for regex replacement
      const escapedOriginal = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const replaceRegex = new RegExp(`(src|href)=["']${escapedOriginal}["']`, 'g');
      localizedHtml = localizedHtml.replace(replaceRegex, `$1="${localPath}"`);

    } catch (err) {
      // console.error(`[ASSETS] Failed to download ${absoluteUrl}: ${err.message}`);
    }
  }

  return localizedHtml;
}

module.exports = { saveAssets };
