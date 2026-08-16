/**
 * settings.js
 * Settings page logic: test duration, thread count, default server,
 * units, theme, and reset-to-defaults. Persists via Storage module.
 */

(function () {
  const el = (id) => document.getElementById(id);

  function populateServerOptions() {
    const select = el('setting-server');
    if (!select) return;
    const servers = window.SPEEDTEST_SERVERS || [];
    select.innerHTML = '<option value="auto">Auto-select (recommended)</option>' +
      servers.map((s) => '<option value="' + s.id + '">' + window.UI.escapeHtml(s.name) + '</option>').join('');
  }

  function loadIntoForm() {
    const s = window.Storage.getSettings();
    el('setting-duration') && (el('setting-duration').value = s.duration);
    el('setting-duration-out') && (el('setting-duration-out').textContent = s.duration + 's');
    el('setting-threads') && (el('setting-threads').value = s.threads);
    el('setting-threads-out') && (el('setting-threads-out').textContent = s.threads);
    el('setting-server') && (el('setting-server').value = s.defaultServerId);

    document.querySelectorAll('input[name="units"]').forEach((r) => { r.checked = r.value === s.units; });
    document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === s.theme; });
    syncRadioCardStyles();
  }

  function syncRadioCardStyles() {
    document.querySelectorAll('.radio-card').forEach((card) => {
      const input = card.querySelector('input');
      if (input) card.classList.toggle('active', input.checked);
    });
  }

  function saveFromForm() {
    const duration = parseInt(el('setting-duration').value, 10);
    const threads = parseInt(el('setting-threads').value, 10);
    const defaultServerId = el('setting-server').value;
    const units = document.querySelector('input[name="units"]:checked')?.value || 'Mbps';
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'light';

    window.Storage.saveSettings({ duration, threads, defaultServerId, units, theme });
    window.Storage.setTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);

    const status = el('save-status');
    if (status) {
      status.textContent = 'Settings saved.';
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 2200);
    }
  }

  function resetDefaults() {
    if (!window.confirm('Reset all settings to defaults?')) return;
    const defaults = window.Storage.resetSettings();
    window.Storage.setTheme(defaults.theme);
    document.documentElement.setAttribute('data-theme', defaults.theme);
    loadIntoForm();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!el('setting-duration')) return;
    populateServerOptions();
    loadIntoForm();

    el('setting-duration') && el('setting-duration').addEventListener('input', (e) => {
      el('setting-duration-out').textContent = e.target.value + 's';
    });
    el('setting-threads') && el('setting-threads').addEventListener('input', (e) => {
      el('setting-threads-out').textContent = e.target.value;
    });
    document.querySelectorAll('input[name="units"], input[name="theme"]').forEach((r) => {
      r.addEventListener('change', syncRadioCardStyles);
    });

    el('settings-form') && el('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      saveFromForm();
    });
    el('reset-settings-btn') && el('reset-settings-btn').addEventListener('click', resetDefaults);
  });
})();
