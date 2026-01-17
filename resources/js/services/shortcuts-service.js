// Shortcuts Service - Manages keyboard shortcuts with localStorage persistence

const STORAGE_KEY = 'webtmux-shortcuts';

// Default shortcuts configuration
const DEFAULT_SHORTCUTS = [
  { id: 'esc', label: 'ESC', keys: [0x1b], enabled: true, order: 0, builtin: true, showInCollapsed: true },
  { id: 'tab', label: 'Tab', keys: [0x09], enabled: true, order: 1, builtin: true, showInCollapsed: true },
  { id: 'shift-tab', label: '\u21e7Tab', keys: [0x1b, 0x5b, 0x5a], enabled: true, order: 2, builtin: true, showInCollapsed: true },
  { id: 'ctrl-c', label: '^C', keys: [0x03], enabled: true, order: 3, builtin: true, showInCollapsed: true },
  { id: 'ctrl-d', label: '^D', keys: [0x04], enabled: true, order: 4, builtin: true, showInCollapsed: false },
  { id: 'pipe', label: '|', keys: [0x7c], enabled: true, order: 5, builtin: true, showInCollapsed: true },
  { id: 'slash', label: '/', keys: [0x2f], enabled: true, order: 6, builtin: true, showInCollapsed: true },
  { id: 'backslash', label: '\\', keys: [0x5c], enabled: true, order: 7, builtin: true, showInCollapsed: false },
  { id: 'arrow-up', label: '\u2191', keys: [0x1b, 0x5b, 0x41], enabled: true, order: 8, builtin: true, showInCollapsed: false },
  { id: 'arrow-down', label: '\u2193', keys: [0x1b, 0x5b, 0x42], enabled: true, order: 9, builtin: true, showInCollapsed: false },
  { id: 'arrow-left', label: '\u2190', keys: [0x1b, 0x5b, 0x44], enabled: true, order: 10, builtin: true, showInCollapsed: false },
  { id: 'arrow-right', label: '\u2192', keys: [0x1b, 0x5b, 0x43], enabled: true, order: 11, builtin: true, showInCollapsed: false },
];

// Common key templates for the "Add Shortcut" UI
export const KEY_TEMPLATES = [
  { label: 'Enter', keys: [0x0d] },
  { label: 'Backspace', keys: [0x7f] },
  { label: 'Delete', keys: [0x1b, 0x5b, 0x33, 0x7e] },
  { label: 'Home', keys: [0x1b, 0x5b, 0x48] },
  { label: 'End', keys: [0x1b, 0x5b, 0x46] },
  { label: 'Page Up', keys: [0x1b, 0x5b, 0x35, 0x7e] },
  { label: 'Page Down', keys: [0x1b, 0x5b, 0x36, 0x7e] },
  { label: 'Arrow Up', keys: [0x1b, 0x5b, 0x41] },
  { label: 'Arrow Down', keys: [0x1b, 0x5b, 0x42] },
  { label: 'Arrow Right', keys: [0x1b, 0x5b, 0x43] },
  { label: 'Arrow Left', keys: [0x1b, 0x5b, 0x44] },
  { label: 'Shift+Up', keys: [0x1b, 0x5b, 0x31, 0x3b, 0x32, 0x41] },
  { label: 'Shift+Down', keys: [0x1b, 0x5b, 0x31, 0x3b, 0x32, 0x42] },
  { label: 'Shift+Left', keys: [0x1b, 0x5b, 0x31, 0x3b, 0x32, 0x44] },
  { label: 'Shift+Right', keys: [0x1b, 0x5b, 0x31, 0x3b, 0x32, 0x43] },
  { label: 'Ctrl+A', keys: [0x01] },
  { label: 'Ctrl+E', keys: [0x05] },
  { label: 'Ctrl+K', keys: [0x0b] },
  { label: 'Ctrl+U', keys: [0x15] },
  { label: 'Ctrl+W', keys: [0x17] },
  { label: 'Ctrl+L', keys: [0x0c] },
  { label: 'Ctrl+R', keys: [0x12] },
  { label: 'Ctrl+Z', keys: [0x1a] },
];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function generateId() {
  return 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getShortcuts() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const shortcuts = JSON.parse(stored);
      // Validate structure
      if (Array.isArray(shortcuts) && shortcuts.every(s => s.id && s.label && Array.isArray(s.keys))) {
        return shortcuts;
      }
    }
  } catch (e) {
    console.warn('Failed to load shortcuts from localStorage:', e);
  }
  return deepClone(DEFAULT_SHORTCUTS);
}

export function saveShortcuts(shortcuts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    window.dispatchEvent(new CustomEvent('shortcuts-updated', { detail: { shortcuts } }));
    return true;
  } catch (e) {
    console.warn('Failed to save shortcuts to localStorage:', e);
    return false;
  }
}

export function resetToDefaults() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear shortcuts from localStorage:', e);
  }
  return deepClone(DEFAULT_SHORTCUTS);
}

export function addShortcut(shortcuts, label, keys) {
  const newShortcut = {
    id: generateId(),
    label,
    keys: Array.isArray(keys) ? keys : [keys],
    enabled: true,
    order: shortcuts.length,
    builtin: false,
  };
  const updated = [...shortcuts, newShortcut];
  saveShortcuts(updated);
  return updated;
}

export function updateShortcut(shortcuts, id, updates) {
  const updated = shortcuts.map(s => {
    if (s.id === id) {
      return { ...s, ...updates };
    }
    return s;
  });
  saveShortcuts(updated);
  return updated;
}

export function removeShortcut(shortcuts, id) {
  const shortcut = shortcuts.find(s => s.id === id);
  if (shortcut?.builtin) {
    // Cannot remove builtin shortcuts, just disable them
    return updateShortcut(shortcuts, id, { enabled: false });
  }
  const updated = shortcuts.filter(s => s.id !== id);
  // Re-calculate order
  updated.forEach((s, i) => s.order = i);
  saveShortcuts(updated);
  return updated;
}

export function moveShortcut(shortcuts, id, direction) {
  const index = shortcuts.findIndex(s => s.id === id);
  if (index === -1) return shortcuts;

  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= shortcuts.length) return shortcuts;

  const updated = [...shortcuts];
  // Swap
  [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
  // Update order
  updated.forEach((s, i) => s.order = i);
  saveShortcuts(updated);
  return updated;
}

export function toggleShortcut(shortcuts, id) {
  const shortcut = shortcuts.find(s => s.id === id);
  if (!shortcut) return shortcuts;
  return updateShortcut(shortcuts, id, { enabled: !shortcut.enabled });
}

export function toggleShowInCollapsed(shortcuts, id) {
  const shortcut = shortcuts.find(s => s.id === id);
  if (!shortcut) return shortcuts;
  return updateShortcut(shortcuts, id, { showInCollapsed: !shortcut.showInCollapsed });
}

export function getCollapsedShortcuts(shortcuts) {
  return shortcuts
    .filter(s => s.enabled && s.showInCollapsed)
    .sort((a, b) => a.order - b.order);
}

/** Send shortcut keys to terminal. Used by mobile-controls and shortcuts components. */
export function sendShortcut(shortcut) {
  if (!shortcut?.keys || !Array.isArray(shortcut.keys)) return;

  const bytes = new Uint8Array(shortcut.keys);
  const binary = String.fromCharCode(...bytes);

  if (window.webtmux?.sendKeys) {
    window.webtmux.sendKeys(shortcut.keys);
  } else {
    window.webtmux?.sendMessage?.('1', btoa(binary));
  }

  window.webtmux?.terminal?.focus();
}

export { DEFAULT_SHORTCUTS };
