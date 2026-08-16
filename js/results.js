/**
 * results.js
 * History / Results page: renders past test runs from localStorage,
 * supports viewing details and deleting entries.
 */

(function () {
  const el = (id) => document.getElementById(id);

  function render() {
    const tbody = el('history-body');
    const emptyState = el('history-empty');
    const table = el('history-table');
    if (!tbody) return;

    const history = window.Storage.getHistory();
    const settings = window.Storage.getSettings();

    if (!history.length) {
      table && table.classList.add('hidden');
      emptyState && emptyState.classList.remove('hidden');
      return;
    }
    table && table.classList.remove('hidden');
    emptyState && emptyState.classList.add('hidden');

    tbody.innerHTML = history.map((h) => rowHtml(h, settings)).join('');

    tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (window.confirm('Delete this test result? This cannot be undone.')) {
          window.Storage.deleteHistoryEntry(id);
          render();
        }
      });
    });

    tbody.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        showDetail(id);
      });
    });
  }

  function rowHtml(h, settings) {
    const units = settings.units;
    return (
      '<tr>' +
      '<td>' + window.UI.escapeHtml(window.UI.formatDate(h.timestamp)) + '</td>' +
      '<td>' + window.UI.escapeHtml(h.server || '\u2014') + '</td>' +
      '<td>' + window.UI.formatSpeed(h.downloadMbps, units) + ' ' + window.UI.unitLabel(units) + '</td>' +
      '<td>' + window.UI.formatSpeed(h.uploadMbps, units) + ' ' + window.UI.unitLabel(units) + '</td>' +
      '<td>' + (h.pingMs != null ? h.pingMs + ' ms' : '\u2014') + '</td>' +
      '<td>' + (h.jitterMs != null ? h.jitterMs + ' ms' : '\u2014') + '</td>' +
      '<td>' + (h.testMode === 'quick' ? '<span class="pill warn">Quick</span>' : '<span class="pill">Full</span>') + '</td>' +
      '<td>' +
      '<button class="icon-btn" data-action="view" data-id="' + h.id + '">View</button> ' +
      '<button class="icon-btn" data-action="delete" data-id="' + h.id + '">Delete</button>' +
      '</td>' +
      '</tr>'
    );
  }

  function showDetail(id) {
    const entry = window.Storage.getHistoryEntry(id);
    const modal = el('detail-modal');
    const body = el('detail-body');
    if (!entry || !modal || !body) return;
    const settings = window.Storage.getSettings();

    body.innerHTML = [
      '<li><span class="k">Date</span><span class="v">' + window.UI.escapeHtml(window.UI.formatDate(entry.timestamp)) + '</span></li>',
      '<li><span class="k">Server</span><span class="v">' + window.UI.escapeHtml(entry.server || '\u2014') + '</span></li>',
      '<li><span class="k">Download</span><span class="v">' + window.UI.formatSpeed(entry.downloadMbps, settings.units) + ' ' + window.UI.unitLabel(settings.units) + '</span></li>',
      '<li><span class="k">Upload</span><span class="v">' + window.UI.formatSpeed(entry.uploadMbps, settings.units) + ' ' + window.UI.unitLabel(settings.units) + '</span></li>',
      '<li><span class="k">Ping</span><span class="v">' + (entry.pingMs != null ? entry.pingMs + ' ms' : '\u2014') + '</span></li>',
      '<li><span class="k">Jitter</span><span class="v">' + (entry.jitterMs != null ? entry.jitterMs + ' ms' : '\u2014') + '</span></li>',
      '<li><span class="k">Packet loss</span><span class="v">' + (entry.packetLossPercent != null ? entry.packetLossPercent + '%' : 'Not tested') + '</span></li>',
      '<li><span class="k">Test mode</span><span class="v">' + (entry.testMode === 'quick' ? 'Quick' : 'Full') + '</span></li>'
    ].join('');

    modal.classList.remove('hidden');
  }

  function closeDetail() {
    const modal = el('detail-modal');
    if (modal) modal.classList.add('hidden');
  }

  function clearAll() {
    if (!window.Storage.getHistory().length) return;
    if (window.confirm('Delete ALL saved test history? This cannot be undone.')) {
      window.Storage.clearHistory();
      render();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!el('history-body')) return;
    render();
    el('clear-history-btn') && el('clear-history-btn').addEventListener('click', clearAll);
    el('detail-close') && el('detail-close').addEventListener('click', closeDetail);
    el('detail-modal') && el('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') closeDetail();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });
  });
})();
