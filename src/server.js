const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { createJob, getJob } = require('./jobStore');
const { capturePage } = require('./capture');
const { listSessions, getSessionPath } = require('./sessionManager');
const { ensureDir } = require('./utils');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/outputs', express.static(config.outputDir));

ensureDir(config.outputDir);

// UI Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Routes
app.get('/api/sessions', (req, res) => {
  res.json(listSessions());
});

app.post('/api/capture', (req, res) => {
  const { url, ...options } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const jobId = uuidv4();
  createJob(jobId, { url, options });

  // Run capture in background
  const storageStatePath = options.session ? getSessionPath(options.session) : null;
  
  capturePage(jobId, {
    url,
    ...options,
    storageStatePath
  }).catch(err => {
    console.error(`Unhandled capture error for job ${jobId}:`, err);
  });

  res.json({ jobId });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.get('/api/outputs', (req, res) => {
  try {
    const folders = fs.readdirSync(config.outputDir)
      .filter(f => fs.lstatSync(path.join(config.outputDir, f)).isDirectory())
      .sort((a, b) => b.localeCompare(a)); // Newest first
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list outputs' });
  }
});

app.get('/api/outputs/:folder', (req, res) => {
  const folderPath = path.join(config.outputDir, req.params.folder);
  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  try {
    const files = fs.readdirSync(folderPath);
    const metadata = JSON.parse(fs.readFileSync(path.join(folderPath, 'metadata.json'), 'utf8'));
    res.json({ folder: req.params.folder, files, metadata });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read folder content' });
  }
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`Page Saver Web UI: http://localhost:${config.port}`);
  console.log(`Outputs directory: ${path.resolve(config.outputDir)}`);
  console.log(`Sessions directory: ${path.resolve(config.sessionsDir)}`);
  console.log(`=========================================`);
});
