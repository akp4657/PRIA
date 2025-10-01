const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const imageOptions = ['assets/blur1.jpg', 'assets/blur2.jpg', 'assets/blur3.jpg', 'assets/blur4.jpg', null]; // `null` means no image
const defaultMessages = [
  "Warning: Unauthorized content detected.",
  "Access violation in progress.",
  "Filtering prohibited material...",
  "PRIA is monitoring your activity.",
  "Content blocked by PRIA protocol.",
  "System anomaly detected.",
  "Your actions are being observed."
];
const { loadDB } = require('./pria_db_setup');
let db;

let win;
let speechWin;
let dimWin;

//#region Creation Functions
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: 400,
    height: 400,
    x: width - 220,
    y: height - 220,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: __dirname + '/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.loadFile('pet.html').then(() => {
    win.show();
    win.moveTop();
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true);
    win.setFocusable(false);
    
    // Load settings panel as overlay
    loadSettingsOverlay();
  });

  // Add global keyboard shortcut for settings (Ctrl+Shift+S)
  const { globalShortcut } = require('electron');
  globalShortcut.register('Shift+S', () => {
    createSettingsUI();
  });

  setTimeout(() => {
    win.setAlwaysOnTop(true, 'pop-up-menu');
  }, 200);

  setInterval(() => {
    win.setAlwaysOnTop(true, 'pop-up-menu');
  }, 10000);


  ipcMain.handle('get-bounds', () => win.getBounds());
  ipcMain.handle('get-display-bounds', () => screen.getPrimaryDisplay().workArea);
  ipcMain.on('set-bounds', (_, bounds) => {
    win.setBounds(bounds);
    // Update speech bubble position when PRIA moves
    if (speechWin && !speechWin.isDestroyed()) {
      const currentHeight = speechWin.getBounds().height;
      const speechY = Math.max(0, bounds.y - currentHeight - 20);
      speechWin.setBounds({
        x: bounds.x + 10,
        y: speechY,
        width: speechWin.getBounds().width,
        height: currentHeight
      }, false);
    }
  });
}

async function createPopup(explicitMessage = null) {
  
  // Check if database is ready
  if (!db) {
    console.error('Database not ready, cannot create popup');
    return;
  }
  
  try {
    const { width, height, x: screenX, y: screenY } = screen.getPrimaryDisplay().workArea;

    // Get settings from LokiJS
    const settingsCol = db.getCollection('settings');
    if (!settingsCol) {
      console.error('Settings collection not found');
      return;
    }
    
    const settings = settingsCol.findOne();

    const intensiveMode = settings?.IntensiveMode;    // default true for testing
    const standardMode = settings?.StandardMode;

    const mediaCol = db.getCollection('media');
    if (!mediaCol) {
      console.error('Media collection missing');
      return;
    }

    // Select media based on mode:
    // IntensiveMode: only Advanced content (Standard: false)
    // Advanced (intensiveMode false + standardMode false): both Advanced and Standard (no filter)
    // Standard (intensiveMode false + standardMode true): only Standard (Standard: true)
    let availableMedia;
    if (intensiveMode) {
      availableMedia = mediaCol.find({ Type: 'Image', Standard: false });
    } else if (!standardMode) {
      // Advanced mode (both Advanced and Standard)
      availableMedia = mediaCol.find();
    } else {
      // Standard mode
      availableMedia = mediaCol.find({ Standard: true });
    }

    // Pick a random media from available media
    const randomMedia = availableMedia && availableMedia.length > 0
      ? availableMedia[Math.floor(Math.random() * availableMedia.length)]
      : null;

    // Determine what text/image to show
    let text = explicitMessage || null;
    let image = null;

    if (!text) {
      if (randomMedia && randomMedia.Type === 'Text') {
        try {
          text = await loadFromObject(randomMedia);
        } catch (err) {
          console.error('Failed to read text file:', err);
          text = defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
        }
      } else if (randomMedia && randomMedia.Type === 'Image') {
        image = randomMedia.Path;
      } else {
        // fallback default message
        text = defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
      }
    } else {
      // Explicit message passed: 50% chance add random image if available
      if (Math.random() < 0.5 && randomMedia && randomMedia.Type === 'Image') {
        image = randomMedia.Path;
      }
    }
    
    // Ensure we always have some content to show
    if (!text && !image) {
      text = defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
    }

    const hasImage = !!image;

    // Default popup size
    let popupWidth = Math.floor(Math.random() * 200) + 150;
    let popupHeight = Math.floor(Math.random() * 120) + 80;

    // If image, adjust popup size to image size (scaled down)
    if (hasImage) {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(path.join(__dirname, image));
      const size = img.getSize();

      if (size.width && size.height) {
        popupWidth = Math.floor(size.width * 0.75) + 20;
        popupHeight = Math.floor(size.height * 0.75) + 40;
      }
    }

    // Create the popup window
    const popup = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: Math.floor(Math.random() * (width - popupWidth)) + screenX,
      y: Math.floor(Math.random() * (height - popupHeight)) + screenY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      }
    });
    
    try {
      await popup.loadFile('popup.html');
    } catch (err) {
      console.error('Failed to load popup.html:', err);
      popup.destroy();
      return;
    }

    // Send the content to popup renderer
    try {
      popup.webContents.send('set-message', { text, image });
    } catch (err) {
      console.error('Failed to send message to popup:', err);
      popup.destroy();
      return;
    }
    popup.show();

  } catch (err) {
    console.error('Error in createPopup:', err);
  }
}

function createSpeechWindow() {
  speechWin = new BrowserWindow({
    width: 200,
    height: 100,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  speechWin.loadFile('speech.html');
  
  // Ensure speech window has higher z-index than PRIA
  speechWin.setAlwaysOnTop(true, 'pop-up-menu');
}

// Dimmed background for Intensive Mode
async function createDimOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  // Get settings from LokiJS
  const settingsCol = db.getCollection('settings');
  const settings = settingsCol ? settingsCol.findOne() : null;

  dimWin = new BrowserWindow({
    show: false,
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    fullscreen: false,
    enableLargerThanScreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  let mode = await getCurrentMode();
  dimWin.loadFile('dim-overlay.html'); // simple HTML with black semi-transparent bg

  // Make sure it ignores mouse events so clicks go through to windows below
  dimWin.setIgnoreMouseEvents(true);

  // Show the window
  if(mode == 'I') {
    dimWin.show();
  }
 // dimWin.setAlwaysOnTop(true, 'sc');
 // dimWin.webContents.openDevTools({ mode: 'detach' });

}

let settingsWin = null;

function createSettingsUI() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    settingsWin.show();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workArea;
  settingsWin = new BrowserWindow({
    width: 320,
    height: 400,
    x: width - 340,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    show: false, // Don't show initially
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  settingsWin.loadFile('settings.html');
  
  // Show the window after it's loaded
  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
  });
  
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function loadSettingsOverlay() {
  // This function is now deprecated - using independent settings window
  createSettingsUI();
}
//#endregion

//#region IPC Handlers
ipcMain.on('spawn-popup', (_, message) => {
  createPopup(message);
});

ipcMain.on('show-speech', (_, { text, x, y }) => {
  if (!speechWin) return;
  
  // Position speech bubble above PRIA with some offset
  const speechX = x + 10;
  const speechY = Math.max(0, y - 120); // Position above PRIA with buffer

  speechWin.setBounds({
    x: speechX,
    y: speechY,
    width: 200,
    height: 100
  });

  speechWin.webContents.send('set-message', text);
  
  // Ensure speech window stays on top
  speechWin.setAlwaysOnTop(true, 'pop-up-menu');
});


ipcMain.on('speech-height', (_, height) => {
  if (!speechWin) return;
  
  const priaBounds = win.getBounds();
  const speechX = speechWin.getBounds().x;
  const speechY = Math.max(0, priaBounds.y - height - 20); // Position above PRIA with 20px buffer

  speechWin.setBounds({
    x: speechX,
    y: speechY,
    width: speechWin.getBounds().width,
    height
  });

  speechWin.showInactive();
});

ipcMain.on('move-speech', (_, { x, y }) => {
  if (!speechWin) return;

  const currentHeight = speechWin.getBounds().height;
  const speechY = Math.max(0, y - currentHeight - 20); // Keep above PRIA

  speechWin.setBounds({
    x: x + 10,
    y: speechY,
    width: speechWin.getBounds().width,
    height: currentHeight,
  }, false);
});

ipcMain.on('resize-window', (_, { width, height }) => {
  if (speechWin && !speechWin.isDestroyed()) {
    speechWin.setSize(Math.ceil(width), Math.ceil(height));
  }
});

ipcMain.handle('get-idle-lines', async () => {
  const settings = db.getCollection('settings');
  const media = db.getCollection('media');
  const currentSettings = settings?.data[0];

  if (!currentSettings) return [];

  let eligibleTexts = [];

  if (currentSettings.IntensiveMode) {
    eligibleTexts = media.find({ Type: 'Text', Standard: false }) || [];
  } else if (currentSettings.StandardMode) {
    eligibleTexts = media.find({ Type: 'Text', Standard: true }) || [];
  } else {
    eligibleTexts = media.find({ Type: 'Text' });
  }

  const texts = await Promise.all(eligibleTexts.map(loadFromObject));
  return texts.filter(Boolean);
});

ipcMain.handle('get-settings', () => {
  const settingsCol = db.getCollection('settings');
  const settings = settingsCol ? settingsCol.findOne() : null;
  return settings || {};
});

ipcMain.on('save-settings', (_, newSettings) => {
  const settingsCol = db.getCollection('settings');

  if (settingsCol) {
    const current = settingsCol.findOne() || {};
    Object.assign(current, newSettings);

    if (!current.$loki) {
      settingsCol.insert(current);
    } else {
      settingsCol.update(current);
    }

    db.saveDatabase();

    console.log(db)

    // // Optional: Send an event to other windows to update behavior
    // if (dimWin && !dimWin.isDestroyed()) {
    //   dimWin.webContents.send('mode-updated', newSettings);
    // }
    // if (win && !win.isDestroyed()) {
    //   win.webContents.send('mode-updated', newSettings);
    // }
  }
});

ipcMain.on('settings-updated', async () => {
  const current = getCurrentMode();

  if (current) {
    console.log('Settings updated:', current);
    const mode = current ? 'I' : current ? 'S' : 'A';
    if (dimWin && !dimWin.isDestroyed()) {
      dimWin.webContents.send('mode-changed', mode);
    }
  }
});

ipcMain.handle('get-all-settings', () => {
  const settingsCol = db.getCollection('settings');
  const settings = settingsCol ? settingsCol.findOne() : null;
  return settings || {};
});

ipcMain.handle('show-settings', () => {
  createSettingsUI();
  return true;
});

ipcMain.on('update-settings', (_, newSettings) => {
  const settingsCol = db.getCollection('settings');

  if (settingsCol) {
    const current = settingsCol.findOne() || {};
    Object.assign(current, newSettings);

    if (!current.$loki) {
      settingsCol.insert(current);
    } else {
      settingsCol.update(current);
    }

    db.saveDatabase();
    console.log('Settings updated:', current);
    
    // Apply settings changes immediately
    applySettingsChanges(newSettings);
  }
});

function applySettingsChanges(settings) {
  // Update dim overlay based on mode
  if (settings.IntensiveMode !== undefined) {
    const mode = settings.IntensiveMode ? 'I' : settings.StandardMode ? 'S' : 'A';
    if (dimWin && !dimWin.isDestroyed()) {
      dimWin.webContents.send('mode-changed', mode);
      if (mode === 'I') {
        dimWin.show();
      } else {
        dimWin.hide();
      }
    }
  }
  
  // Update popup frequency
  if (settings.Popups !== undefined) {
    // This would affect the popup interval in pet.js
    // We'll need to send this to the pet window
    if (win && !win.isDestroyed()) {
      win.webContents.send('popup-frequency-updated', settings.Popups);
    }
  }
}
//#endregion

//#region Helper functions
// Helper to read text from disk asynchronously
async function getCurrentMode() {
  const settings = db.getCollection('settings');
  if (!settings) return 'S'; // fallback mode

  const setting = settings.findOne();
  if (!setting) return 'S';

  if (setting.IntensiveMode) return 'I';
  return setting.StandardMode ? 'S' : 'A';
}

async function loadFromObject(mediaObj) {
  if (!mediaObj || mediaObj.Type !== 'Text') return null;

  try {
    const fullPath = path.isAbsolute(mediaObj.Path)
      ? mediaObj.Path
      : path.join(__dirname, mediaObj.Path);

    const content = await fs.readFile(fullPath, 'utf8');
    return content.trim();
  } catch (err) {
    console.error(`Failed to load media text from ${mediaObj.Path}:`, err);
    return null;
  }
}

// function randomFromArray(arr) {
//   return arr[Math.floor(Math.random() * arr.length)];
// }
//#endregion
app.whenReady().then(async () => {
  db = await loadDB();
  await createDimOverlay();
  await createSpeechWindow();
  await createWindow();
  // Settings panel is created but hidden by default
  // It will only show when triggered by keyboard shortcut or programmatically
});

// Cleanup global shortcuts on quit
app.on('will-quit', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
});
