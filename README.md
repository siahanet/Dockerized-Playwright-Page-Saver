# 🌐 Playwright Page Saver

A complete, clean, reusable Dockerized application that allows you to save fully rendered web pages through a web interface or CLI.

## 🚀 Features

- **Web Interface**: Easy-to-use UI for triggering captures and viewing results.
- **Full Rendering**: Uses Playwright Chromium to execute JavaScript and render complex SPAs.
- **Asset Localization**: Best-effort attempt to download page assets (images, CSS) and rewrite paths for better offline viewing.
- **Session Management**: Support for Playwright storage state (cookies, localStorage) to capture authenticated areas.
- **Robust Auto-Scroll**: Incremental scrolling to trigger lazy-loaded content.
- **Comprehensive Outputs**: Saves HTML, full-page screenshots, PDFs, metadata, console logs, and network summaries.
- **Dockerized**: Runs entirely in a container with all dependencies pre-installed.
- **Uncommon Port**: Runs on port `38473` to avoid common port conflicts.

## 🛠️ Installation & Setup

### Using Docker (Recommended)

1. **Build the image**:
   ```bash
   docker compose build
   ```

2. **Start the application**:
   ```bash
   docker compose up -d
   ```

3. **Access the Web UI**:
   Open your browser and go to `http://localhost:38473`

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

## 📖 Usage

### Web Interface
1. Enter the target URL.
2. Configure capture options (WaitUntil, Delay, Viewport, etc.).
3. (Optional) Select a session file from the `sessions/` folder.
4. Click **Start Capture**.
5. Monitor live logs and progress.
6. Download results once completed.

### CLI Support
You can also run captures from the command line:
```bash
node src/cli.js --url "https://example.com" --screenshot true --pdf true
```

### Session Management
To use a session:
1. Manually place a Playwright `storageState.json` file in the `sessions/` directory.
2. Select it in the Web UI or use `--session filename.json` in the CLI.
3. You can also toggle "Export Session" to save the updated state after a run.

## 📁 Output Structure

Each capture creates a unique folder in `outputs/`:
- `page.html`: Rendered HTML with localized assets.
- `screenshot.png`: Full-page screenshot.
- `page.pdf`: PDF snapshot (if enabled).
- `metadata.json`: Comprehensive run metadata.
- `console.log`: Browser console output.
- `network-summary.json`: Summary of successful and failed requests.
- `assets/`: Downloaded images and stylesheets.

## ⚠️ Limitations & Notes

- **Offline Replay**: While asset localization is implemented, perfect offline replay is not guaranteed for all sites (e.g., those with complex dynamic loading or strict CSP).
- **Bot Protection**: Some sites may block automated browsers.
- **PDF Generation**: Only works in headless mode.
- **Storage State**: Does not support manual login via the UI; you must provide a pre-captured storage state file.

## ⚙️ Configuration

Defaults can be adjusted in `src/config.js` or via environment variables in `.env`.

- `PORT`: Default is `38473`.
- `OUTPUT_DIR`: Default is `outputs`.
- `SESSIONS_DIR`: Default is `sessions`.
