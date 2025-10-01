const loki = require('lokijs');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const EXTENSION_TYPE_MAP = {
  '.jpg': 'Image',
  '.jpeg': 'Image',
  '.png': 'Image',
  '.gif': 'Image',
  '.webp': 'Image',
  '.mp3': 'Audio',
  '.wav': 'Audio',
  '.ogg': 'Audio',
  '.txt': 'Text',
  '.md': 'Text',
};

// Define database file path
const dbPath = path.join(__dirname, 'pria.db');

let _resolve;
const dbReady = new Promise(resolve => _resolve = resolve);

const db = new loki(dbPath, {
  autoload: true,
  autoloadCallback: () => {
    console.log('[PRIA DB] Loaded successfully.');
    initializeDatabase(); // Initialize collections when DB loads
    _resolve(db);
  },
  autosave: true,
  autosaveInterval: 5000
});

function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    const user = db.getCollection('users') || db.addCollection('user');
    const settings = db.getCollection('settings') || db.addCollection('settings');
    const media = db.getCollection('media') || db.addCollection('media');

    if (user.count() === 0) {
      user.insert({
        Username: os.userInfo().username || "USERNAME",
        Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "EST",
        Sessions: 1,
        CDUs: 0,
        NEC: 0
      });
      console.log('User collection initialized');
    }

    if (settings.count() === 0) {
      settings.insert({
        Volume: 100,
        Intensity: 2,
        Popups: 2,
        Name: os.userInfo().username || "USERNAME",
        StandardMode: true,
        IntensiveMode: false
      });
      console.log('Settings collection initialized');
    }

    if (media.count() === 0) {
      const assetsDir = path.join(__dirname, 'assets');
      console.log('Scanning assets directory:', assetsDir);
      
      if (fs.existsSync(assetsDir)) {
        const scannedMedia = scanMediaAssets(assetsDir);
        media.insert(scannedMedia);
        console.log(`Inserted ${scannedMedia.length} media items.`);
      } else {
        console.warn('Assets directory not found:', assetsDir);
      }
    }

    db.saveDatabase();
    console.log('Database initialization complete');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Helpers
function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_TYPE_MAP[ext] || null;
}

function isStandard(fullPath) {
  return fullPath.toLowerCase().includes(path.sep + 'standard' + path.sep);
}

function scanMediaAssets(rootDir) {
  const results = [];

  try {
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const type = getMediaType(entry.name);
          if (!type) continue;

          results.push({
            ID: entry.name,
            Type: type,
            Standard: isStandard(fullPath),
            Path: path.relative(__dirname, fullPath).replace(/\\/g, '/'), // relative and clean slashes
          });
        }
      }
    }

    walk(rootDir);
    console.log(`Scanned ${results.length} media files from ${rootDir}`);
  } catch (error) {
    console.error('Error scanning media assets:', error);
  }
  
  return results;
}

module.exports = {
  loadDB: () => dbReady
};
