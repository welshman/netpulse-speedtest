/**
 * storage.js
 * Handles all localStorage persistence: theme, settings, and test history.
 * No external dependencies.
 */

const STORAGE_KEYS = {
  HISTORY: 'netpulse_history_v1',
  SETTINGS: 'netpulse_settings_v1',
  THEME: 'netpulse_theme_v1'
};

const DEFAULT_SETTINGS = {
  theme: 'light',
  units: 'Mbps',
  duration: 10,
  threads: 4,
  defaultServerId: 'auto',
  testMode: 'full'
};

const Storage = {
  getSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      console.warn('Storage.getSettings failed', e);
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(settings) {
    try {
      const merged = { ...this.getSettings(), ...settings };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn('Storage.saveSettings failed', e);
      return settings;
    }
  },

  resetSettings() {
    try {
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  },

  getTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored) return stored;
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  },

  setTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    } catch (e) { /* ignore */ }
  },

  getHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Storage.getHistory failed', e);
      return [];
    }
  },

  addHistoryEntry(entry) {
    try {
      const history = this.getHistory();
      const record = {
        id: entry.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
        timestamp: entry.timestamp || Date.now(),
        ...entry
      };
      history.unshift(record);
      const trimmed = history.slice(0, 100);
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(trimmed));
      return record;
    } catch (e) {
      console.warn('Storage.addHistoryEntry failed', e);
      return entry;
    }
  },

  deleteHistoryEntry(id) {
    try {
      const history = this.getHistory().filter((h) => h.id !== id);
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      return history;
    } catch (e) {
      console.warn('Storage.deleteHistoryEntry failed', e);
      return this.getHistory();
    }
  },

  clearHistory() {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch (e) { /* ignore */ }
    return [];
  },

  getHistoryEntry(id) {
    return this.getHistory().find((h) => h.id === id) || null;
  }
};

window.Storage = Storage;
window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
