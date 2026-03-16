const axios = require('axios');
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');
const { ensureDir } = require('./utils');

/**
 * Manages asset downloading and localization.
 */
class AssetManager {
  constructor(outputDir, baseUrl) {
    this.outputDir = outputDir;
    this.assetsDir = path.join(outputDir, 'assets');
    this.baseUrl = baseUrl;
    this.downloadedAssets = new Map(); // absoluteUrl -> localPath
    this.processingAssets = new Set(); // To prevent infinite loops
    ensureDir(this.assetsDir);
  }

  /**
   * Resolves a URL relative to a base URL.
   */
  resolveUrl(url, base) {
    try {
      return new URL(url, base).href;
    } catch (e) {
      return null;
    }
  }

  /**
   * Downloads an asset and saves it locally.
   * If it's a CSS file, it processes it recursively.
   */
  async downloadAsset(absoluteUrl, isCss = false) {
    if (this.downloadedAssets.has(absoluteUrl)) {
      return this.downloadedAssets.get(absoluteUrl);
    }

    if (this.processingAssets.has(absoluteUrl)) {
      return null; // Avoid recursion loops
    }

    this.processingAssets.add(absoluteUrl);

    try {
      const urlObj = new URL(absoluteUrl);
      let ext = path.extname(urlObj.pathname);
      
      // If no extension, try to guess from content-type or just use .bin
      const filename = `${Math.random().toString(36).slice(2, 10)}${ext || '.bin'}`;
      const filePath = path.join(this.assetsDir, filename);

      const response = await axios({
        method: 'get',
        url: absoluteUrl,
        responseType: isCss ? 'text' : 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      let content = response.data;

      if (isCss) {
        content = await this.processCss(content, absoluteUrl);
        fs.writeFileSync(filePath, content);
      } else {
        fs.writeFileSync(filePath, Buffer.from(content));
      }

      const localPath = `assets/${filename}`;
      this.downloadedAssets.set(absoluteUrl, localPath);
      return localPath;
    } catch (err) {
      console.error(`[ASSETS] Failed to download ${absoluteUrl}: ${err.message}`);
      return null;
    } finally {
      this.processingAssets.delete(absoluteUrl);
    }
  }

  /**
   * Parses CSS and recursively downloads assets.
   */
  async processCss(cssContent, cssUrl) {
    let root;
    try {
      root = postcss.parse(cssContent);
    } catch (e) {
      console.error(`[ASSETS] Failed to parse CSS at ${cssUrl}: ${e.message}`);
      return cssContent; // Return original if parsing fails
    }

    const atRuleTasks = [];
    root.walkAtRules('import', (atRule) => {
      const params = valueParser(atRule.params);
      const nodeTasks = [];
      
      params.walk((node) => {
        let importUrl = '';
        if (node.type === 'function' && node.value === 'url' && node.nodes.length > 0) {
          importUrl = node.nodes[0].value;
        } else if (node.type === 'string') {
          importUrl = node.value;
        }

        if (importUrl && !importUrl.startsWith('data:')) {
          const absoluteUrl = this.resolveUrl(importUrl, cssUrl);
          if (absoluteUrl) {
            nodeTasks.push((async () => {
              const localPath = await this.downloadAsset(absoluteUrl, true);
              if (localPath) {
                const filename = path.basename(localPath);
                if (node.type === 'function') {
                  node.nodes[0].value = filename;
                } else {
                  node.value = filename;
                }
              }
            })());
          }
        }
      });

      atRuleTasks.push((async () => {
        await Promise.all(nodeTasks);
        atRule.params = params.toString();
      })());
    });

    const declTasks = [];
    root.walkDecls((decl) => {
      if (decl.value.includes('url(')) {
        const parsed = valueParser(decl.value);
        const nodeTasks = [];

        parsed.walk((node) => {
          if (node.type === 'function' && node.value === 'url' && node.nodes.length > 0) {
            const urlNode = node.nodes[0];
            const assetUrl = urlNode.value;
            if (assetUrl && !assetUrl.startsWith('data:')) {
              const absoluteUrl = this.resolveUrl(assetUrl, cssUrl);
              if (absoluteUrl) {
                nodeTasks.push((async () => {
                  const isNestedCss = absoluteUrl.toLowerCase().split('?')[0].endsWith('.css');
                  const localPath = await this.downloadAsset(absoluteUrl, isNestedCss);
                  if (localPath) {
                    urlNode.value = path.basename(localPath);
                  }
                })());
              }
            }
          }
        });

        declTasks.push((async () => {
          await Promise.all(nodeTasks);
          decl.value = parsed.toString();
        })());
      }
    });

    await Promise.all([...atRuleTasks, ...declTasks]);
    return root.toString();
  }

  /**
   * Localizes HTML by downloading all referenced assets.
   */
  async localizeHtml(html) {
    let localizedHtml = html;
    
    // Extract assets from HTML
    // Improved regex to handle more cases and avoid matching already localized paths
    const assetTags = [
      { regex: /src=["'](?!data:|assets\/)([^"']+)["']/gi, type: 'src' },
      { regex: /href=["'](?!data:|assets\/)([^"']+)["']/gi, type: 'href' },
      { regex: /url\(["']?(?!data:|assets\/)([^"'\)]+)["']?\)/gi, type: 'css-inline' }
    ];

    const foundAssets = [];
    for (const tag of assetTags) {
      let match;
      while ((match = tag.regex.exec(html)) !== null) {
        const originalUrl = match[1];
        const absoluteUrl = this.resolveUrl(originalUrl, this.baseUrl);
        if (absoluteUrl) {
          foundAssets.push({ originalUrl, absoluteUrl, type: tag.type });
        }
      }
    }

    console.log(`[ASSETS] Found ${foundAssets.length} potential assets in HTML.`);

    // Download and replace
    for (const asset of foundAssets) {
      const isCss = asset.absoluteUrl.toLowerCase().split('?')[0].endsWith('.css') || asset.type === 'href' && asset.originalUrl.includes('.css');
      const localPath = await this.downloadAsset(asset.absoluteUrl, isCss);
      
      if (localPath) {
        // Escape special characters for regex replacement
        const escapedOriginal = asset.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let replaceRegex;
        
        if (asset.type === 'css-inline') {
          replaceRegex = new RegExp(`url\\(["']?${escapedOriginal}["']?\\)`, 'g');
          localizedHtml = localizedHtml.replace(replaceRegex, `url("${localPath}")`);
        } else {
          replaceRegex = new RegExp(`${asset.type}=["']${escapedOriginal}["']`, 'g');
          localizedHtml = localizedHtml.replace(replaceRegex, `${asset.type}="${localPath}"`);
        }
      }
    }

    return localizedHtml;
  }
}

async function saveAssets(page, html, outputDir, baseUrl) {
  const manager = new AssetManager(outputDir, baseUrl);
  return await manager.localizeHtml(html);
}

module.exports = { saveAssets };
