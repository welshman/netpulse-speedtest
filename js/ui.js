/**
 * ui.js
 * Shared UI bindings used across all pages: theme toggle, mobile nav,
 * active-link highlighting, and small reusable DOM helpers.
 */

const UI = {
  init() {
    this._applyTheme(window.Storage.getTheme());
    this._bindThemeToggle();
    this._bindMobileNav();
    this._highlightActiveLink();
  },

  _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '\u2600' : '\u263D';
  },

  _bindThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      window.Storage.setTheme(next);
      this._applyTheme(next);
    });
  },

  _bindMobileNav() {
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  },

  _highlightActiveLink() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('#nav-links a').forEach((a) => {
      const href = a.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) {
        a.setAttribute('aria-current', 'page');
      }
    });
  },

  formatSpeed(mbps, units) {
    if (mbps == null || Number.isNaN(mbps)) return '\u2014';
    if (units === 'MBps') return (mbps / 8).toFixed(2);
    return mbps.toFixed(2);
  },

  unitLabel(units) { return units === 'MBps' ? 'MB/s' : 'Mbps'; },

  formatMs(ms) {
    if (ms == null || Number.isNaN(ms)) return '\u2014';
    return Math.round(ms * 10) / 10;
  },

  formatDate(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch (e) {
      return String(ts);
    }
  },

  qualityScore({ downloadMbps, uploadMbps, pingMs, jitterMs, lossPercent }) {
    const dScore = Math.min(40, (downloadMbps / 150) * 40);
    const uScore = Math.min(20, (uploadMbps / 50) * 20);
    const pScore = Math.min(25, Math.max(0, 25 - pingMs / 4));
    const jScore = Math.min(10, Math.max(0, 10 - jitterMs));
    const lScore = Math.min(5, Math.max(0, 5 - (lossPercent || 0)));
    const total = dScore + uScore + pScore + jScore + lScore;
    return Math.round(Math.max(0, Math.min(100, total)));
  },

  qualityLabel(score) {
    if (score >= 85) return { label: 'Excellent', cls: '' };
    if (score >= 65) return { label: 'Good', cls: '' };
    if (score >= 40) return { label: 'Fair', cls: 'warn' };
    return { label: 'Poor', cls: 'bad' };
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
window.UI = UI;
