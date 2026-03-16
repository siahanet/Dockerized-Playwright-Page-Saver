const fs = require('fs');
const path = require('path');
const config = require('./config');
const { ensureDir } = require('./utils');

ensureDir(config.sessionsDir);

function listSessions() {
  try {
    return fs.readdirSync(config.sessionsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({ name: file, path: path.join(config.sessionsDir, file) }));
  } catch (err) {
    console.error('Error listing sessions:', err);
    return [];
  }
}

function getSessionPath(name) {
  if (!name) return null;
  const safeName = name.replace(/[^a-z0-9.-]/gi, '_');
  return path.join(config.sessionsDir, safeName.endsWith('.json') ? safeName : `${safeName}.json`);
}

module.exports = {
  listSessions,
  getSessionPath
};
