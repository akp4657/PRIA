const pria = document.getElementById('pet');

let screenWidth = 1920;
let yPos = 0;
let popupFreq = 6;
let popupInterval;
// let popupIntervals = [
//   30000,
//   15000,
//   8500,
//   4000,
//   2000,
//   1000
// ]

// window.electronAPI.settingsUpdated.then((settings) => {
//   popupFreq = settings.PopupFrequency;
// });

(async () => {
  const screenBounds = await window.electronAPI.getDisplayBounds();
  screenWidth = screenBounds.width + screenBounds.x;
  yPos = screenBounds.y + screenBounds.height - 200;

  const initialBounds = {
    x: screenWidth - 520,
    y: yPos,
    width: 400,
    height: 400
  };

  await window.electronAPI.setBounds(initialBounds);
  await window.electronAPI.moveSpeech(initialBounds.x, initialBounds.y);
})();


async function showSpeech(text) {
  const bounds = await window.electronAPI.getBounds();
  window.electronAPI.showSpeech(text, bounds.x, bounds.y);
}

// Random idle lines
async function idleSpeech() {
  const lines = await window.electronAPI.getIdleLines();
  console.log(lines)
  if (!lines || lines.length === 0) return;

  const line = lines[Math.floor(Math.random() * lines.length)];
  showSpeech(line);
}

// Idle speech loop
setInterval(() => {
  if (Math.random() < 0.5) {
    idleSpeech();
  }
}, 2000);

// Initialize popup frequency from settings
async function initializePopupFrequency() {
  try {
    const settings = await window.electronAPI.getAllSettings();
    const frequency = settings.Popups || 3; // Default to 3 if not set
    
    // Update popup frequency (0-5 scale, convert to actual interval)
    const intervals = [0, 10000, 5000, 2000, 1000, 500]; // milliseconds
    const newInterval = intervals[frequency] || 2000;
    
    // Clear any existing interval and set new one
    if (popupInterval) {
      clearInterval(popupInterval);
    }
    
    popupInterval = setInterval(() => {
      if (Math.random() < 0.6) {
        console.log("Attempting to spawn popup...");
        window.electronAPI.spawnPopup();
      }
    }, newInterval);
    
    console.log('Popup frequency initialized to:', frequency, 'interval:', newInterval);
  } catch (error) {
    console.error('Failed to load popup frequency settings:', error);
    // Fallback to default interval
    popupInterval = setInterval(() => {
      if (Math.random() < 0.6) {
        console.log("Attempting to spawn popup...");
        window.electronAPI.spawnPopup();
      }
    }, 2000);
  }
}

// Initialize popup frequency on startup
initializePopupFrequency();


// Settings button functionality
document.addEventListener('DOMContentLoaded', () => {
  const settingsButton = document.getElementById('settings-button');
  
  settingsButton.addEventListener('click', () => {
    // Trigger settings window creation
    window.electronAPI?.settingsUpdated?.();
  });
});

// Listen for popup frequency updates
window.electronAPI?.onPopupFrequencyUpdated?.((_, frequency) => {
  // Update popup frequency (0-5 scale, convert to actual interval)
  const intervals = [0, 10000, 5000, 2000, 1000, 500]; // milliseconds
  const newInterval = intervals[frequency] || 2000;
  
  // Clear existing interval and set new one
  clearInterval(popupInterval);
  popupInterval = setInterval(() => {
    if (Math.random() < 0.6) {
      console.log("Attempting to spawn popup...");
      window.electronAPI.spawnPopup();
    }
  }, newInterval);
  
  console.log('Popup frequency updated to:', frequency, 'interval:', newInterval);
});

// Interaction
pria.addEventListener('click', () => {
  showSpeech("Unauthorized physical contact.");
});
