/**
 * main.js
 * Home / Test page logic: wires up the SpeedTestEngine to the UI,
 * drives the animated dial + live Chart.js graph, fetches network
 * info (IP/ISP), and persists completed runs to history.
 */

(function () {
  const DIAL_RADIUS = 140;
  const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

  let engine = null;
  let chart = null;
  let currentResult = null;

  const el = (id) => document.getElementById(id);

  function initDialSvg() {
    const track = el('dial-track');
    const progress = el('dial-progress');
    if (!track || !progress) return;
    track.setAttribute('stroke-dasharray', DIAL_CIRCUMFERENCE);
    progress.setAttribute('stroke-dasharray', DIAL_CIRCUMFERENCE);
    progress.setAttribute('stroke-dashoffset', DIAL_CIRCUMFERENCE);
  }

  function setDial(percent, mbps, phaseLabel) {
    const progress = el('dial-progress');
    if (progress) {
      const offset = DIAL_CIRCUMFERENCE - (Math.min(100, Math.max(0, percent)) / 100) * DIAL_CIRCUMFERENCE;
      progress.setAttribute('stroke-dashoffset', offset);
    }
    const valueEl = el('dial-value');
    const unitEl = el('dial-unit');
    const phaseEl = el('dial-phase');
    const settings = window.Storage.getSettings();
    if (valueEl) valueEl.textContent = mbps != null ? window.UI.formatSpeed(mbps, settings.units) : '0.00';
    if (unitEl) unitEl.textContent = window.UI.unitLabel(settings.units);
    if (phaseEl) phaseEl.textContent = phaseLabel || '';
  }

  function initChart() {
    const canvas = el('live-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#9297a8' : '#5b5f6d';

    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Download (Mbps)',
            data: [],
            borderColor: '#4c6ef5',
            backgroundColor: 'rgba(76,110,245,0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Upload (Mbps)',
            data: [],
            borderColor: '#22c3a6',
            backgroundColor: 'rgba(34,195,166,0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { display: true, ticks: { color: textColor, maxTicksLimit: 6 }, grid: { color: gridColor } },
          y: { display: true, beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }
        },
        plugins: {
          legend: { labels: { color: textColor, boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  function pushChartSample(phase, timestampMs, mbps) {
    if (!chart) return;
    const label = (timestampMs / 1000).toFixed(1) + 's';
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(phase === 'download' ? mbps : null);
    chart.data.datasets[1].data.push(phase === 'upload' ? mbps : null);
    if (chart.data.labels.length > 60) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
      chart.data.datasets[1].data.shift();
    }
    chart.update('none');
  }

  function resetChart() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update('none');
  }

  async function loadNetworkInfo() {
    const ipEl = el('net-ip');
    const ispEl = el('net-isp');
    const locEl = el('net-loc');
    const uaEl = el('net-ua');
    const connEl = el('net-conn');

    if (uaEl) uaEl.textContent = navigator.userAgent;

    if (connEl) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && conn.effectiveType) {
        connEl.textContent = conn.effectiveType.toUpperCase() + (conn.saveData ? ' \u00b7 Data Saver' : '');
      } else {
        connEl.textContent = 'Not reported by browser';
      }
    }

    try {
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (!res.ok) throw new Error('ipapi request failed');
      const data = await res.json();
      if (ipEl) ipEl.textContent = data.ip || '\u2014';
      if (ispEl) ispEl.textContent = data.org || data.asn || '\u2014';
      if (locEl) locEl.textContent = [data.city, data.region, data.country_name].filter(Boolean).join(', ') || '\u2014';
    } catch (e) {
      if (ipEl) ipEl.textContent = 'Unavailable';
      if (ispEl) ispEl.textContent = 'Unavailable';
      if (locEl) locEl.textContent = 'Unavailable';
      console.warn('Network info fetch failed', e);
    }
  }

  function renderWarnings() {
    const box = el('warning-box');
    if (!box) return;
    const warnings = [];
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (conn && conn.type && conn.type === 'wifi') {
      warnings.push('You appear to be on Wi-Fi. Wi-Fi interference can lower results \u2014 use Ethernet for the most accurate reading.');
    }
    if (conn && conn.saveData) {
      warnings.push('Data Saver mode is enabled in your browser, which may throttle results.');
    }
    if (document.visibilityState === 'hidden') {
      warnings.push('This tab is not active. Switch back to it to avoid throttled background timers.');
    }
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
      warnings.push('Your device reports very few CPU cores, which can bottleneck high-speed results in the browser.');
    }
    warnings.push('Browser-based tests measure your connection to Cloudflare\u2019s edge network, not a dedicated ISP speed-test server \u2014 results are a close estimate, not a lab-grade measurement.');

    box.innerHTML = warnings
      .map((w) => '<div class="warning-box fade-in" role="note"><span aria-hidden="true">\u26A0\uFE0F</span><div>' + window.UI.escapeHtml(w) + '</div></div>')
      .join('');
  }

  function renderResults(result) {
    const settings = window.Storage.getSettings();
    const units = settings.units;

    el('result-download') && (el('result-download').textContent = window.UI.formatSpeed(result.download.mbps, units));
    el('result-upload') && (el('result-upload').textContent = window.UI.formatSpeed(result.upload.mbps, units));
    el('result-ping') && (el('result-ping').textContent = window.UI.formatMs(result.latency.median));
    el('result-jitter') && (el('result-jitter').textContent = window.UI.formatMs(result.latency.jitter));

    el('result-download-unit') && (el('result-download-unit').textContent = window.UI.unitLabel(units));
    el('result-upload-unit') && (el('result-upload-unit').textContent = window.UI.unitLabel(units));

    const detailEl = el('result-details');
    if (detailEl) {
      const loss = result.packetLoss ? result.packetLoss.lossPercent.toFixed(1) + '%' : 'Not tested';
      const score = window.UI.qualityScore({
        downloadMbps: result.download.mbps,
        uploadMbps: result.upload.mbps,
        pingMs: result.latency.median || 0,
        jitterMs: result.latency.jitter || 0,
        lossPercent: result.packetLoss ? result.packetLoss.lossPercent : 0
      });
      const scoreInfo = window.UI.qualityLabel(score);

      detailEl.innerHTML = [
        rowHtml('Server used', window.UI.escapeHtml(result.server.name)),
        rowHtml('Download (avg / min / max)', fmt(result.download.average, units) + ' / ' + fmt(result.download.min, units) + ' / ' + fmt(result.download.max, units)),
        rowHtml('Upload (avg / min / max)', fmt(result.upload.average, units) + ' / ' + fmt(result.upload.min, units) + ' / ' + fmt(result.upload.max, units)),
        rowHtml('Ping (min / avg / max)', window.UI.formatMs(result.latency.min) + ' / ' + window.UI.formatMs(result.latency.avg) + ' / ' + window.UI.formatMs(result.latency.max) + ' ms'),
        rowHtml('Estimated packet loss', loss),
        rowHtml('Test mode', result.testMode === 'quick' ? 'Quick test' : 'Full test'),
        rowHtml('Connection quality score', '<span class="pill ' + scoreInfo.cls + '">' + score + '/100 \u00b7 ' + scoreInfo.label + '</span>')
      ].join('');
    }

    const shareEl = el('share-link');
    if (shareEl) {
      shareEl.value = buildShareUrl(result);
    }
  }

  function rowHtml(k, v) {
    return '<li><span class="k">' + k + '</span><span class="v">' + v + '</span></li>';
  }
  function fmt(v, units) { return window.UI.formatSpeed(v, units) + ' ' + window.UI.unitLabel(units); }

  function buildShareUrl(result) {
    const payload = {
      d: Math.round(result.download.mbps * 100) / 100,
      u: Math.round(result.upload.mbps * 100) / 100,
      p: Math.round((result.latency.median || 0) * 100) / 100,
      j: Math.round((result.latency.jitter || 0) * 100) / 100,
      s: result.server.id,
      t: result.timestamp,
      m: result.testMode
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    const url = new URL(window.location.href);
    url.hash = 'r=' + encoded;
    return url.toString();
  }

  function readSharedResultFromHash() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#r=')) return null;
    try {
      const encoded = hash.slice(3);
      const payload = JSON.parse(decodeURIComponent(atob(encoded)));
      return payload;
    } catch (e) {
      return null;
    }
  }

  function renderSharedBanner() {
    const shared = readSharedResultFromHash();
    const banner = el('shared-banner');
    if (!banner) return;
    if (!shared) { banner.classList.add('hidden'); return; }
    banner.classList.remove('hidden');
    const settings = window.Storage.getSettings();
    banner.innerHTML =
      '<div class="panel fade-in"><h3 class="mt-0">Shared result</h3>' +
      '<div class="metrics-row">' +
      metricCardHtml('Download', fmt(shared.d, settings.units)) +
      metricCardHtml('Upload', fmt(shared.u, settings.units)) +
      metricCardHtml('Ping', shared.p + ' ms') +
      metricCardHtml('Jitter', shared.j + ' ms') +
      '</div>' +
      '<p class="small muted mt-0">Server: ' + window.UI.escapeHtml(shared.s) + ' \u00b7 ' + window.UI.formatDate(shared.t) + ' \u00b7 ' + (shared.m === 'quick' ? 'Quick test' : 'Full test') + '</p>' +
      '</div>';
  }

  function metricCardHtml(label, value) {
    return '<div class="metric-card"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>';
  }

  function populateServerSelect() {
    const select = el('server-select');
    if (!select) return;
    const settings = window.Storage.getSettings();
    const servers = window.SPEEDTEST_SERVERS || [];
    select.innerHTML = '<option value="auto">Auto-select (recommended)</option>' +
      servers.map((s) => '<option value="' + s.id + '">' + window.UI.escapeHtml(s.name) + '</option>').join('');
    select.value = settings.defaultServerId || 'auto';
    select.addEventListener('change', () => {
      window.Storage.saveSettings({ defaultServerId: select.value });
    });
  }

  function populateModeToggle() {
    const quickBtn = el('mode-quick');
    const fullBtn = el('mode-full');
    if (!quickBtn || !fullBtn) return;
    const settings = window.Storage.getSettings();
    const sync = (mode) => {
      quickBtn.setAttribute('aria-pressed', mode === 'quick' ? 'true' : 'false');
      fullBtn.setAttribute('aria-pressed', mode === 'full' ? 'true' : 'false');
    };
    sync(settings.testMode);
    quickBtn.addEventListener('click', () => { window.Storage.saveSettings({ testMode: 'quick' }); sync('quick'); });
    fullBtn.addEventListener('click', () => { window.Storage.saveSettings({ testMode: 'full' }); sync('full'); });
  }

  async function startTest() {
    const startBtn = el('start-btn');
    const cancelBtn = el('cancel-btn');
    if (startBtn) startBtn.disabled = true;
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    resetChart();
    setDial(0, 0, 'Preparing\u2026');
    el('results-panel') && el('results-panel').classList.add('hidden');

    const settings = window.Storage.getSettings();
    engine = new window.SpeedTestEngine({
      settings,
      onPhaseChange: (phase) => {
        const labels = {
          'selecting-server': 'Finding best server\u2026',
          ping: 'Measuring latency\u2026',
          download: 'Testing download\u2026',
          upload: 'Testing upload\u2026',
          'packet-loss': 'Checking packet loss\u2026',
          done: 'Complete'
        };
        setDial(getCurrentPercent(), null, labels[phase] || phase);
        if (phase === 'download' || phase === 'upload') resetChart();
      },
      onProgress: ({ phase, percent, currentMbps }) => {
        setDial(percent, currentMbps, phase === 'download' ? 'Testing download\u2026' : 'Testing upload\u2026');
      },
      onSample: ({ phase, timestampMs, mbps }) => pushChartSample(phase, timestampMs, mbps)
    });

    try {
      const result = await engine.runFullTest();
      currentResult = result;
      setDial(100, result.download.mbps, 'Complete');
      renderResults(result);
      el('results-panel') && el('results-panel').classList.remove('hidden');

      window.Storage.addHistoryEntry({
        timestamp: result.timestamp,
        server: result.server.name,
        serverId: result.server.id,
        downloadMbps: Math.round(result.download.mbps * 100) / 100,
        uploadMbps: Math.round(result.upload.mbps * 100) / 100,
        pingMs: Math.round((result.latency.median || 0) * 100) / 100,
        jitterMs: Math.round((result.latency.jitter || 0) * 100) / 100,
        packetLossPercent: result.packetLoss ? Math.round(result.packetLoss.lossPercent * 100) / 100 : null,
        testMode: result.testMode
      });
    } catch (e) {
      console.error('Speed test failed', e);
      setDial(0, 0, 'Test failed \u2014 try again');
    } finally {
      if (startBtn) startBtn.disabled = false;
      if (cancelBtn) cancelBtn.classList.add('hidden');
    }
  }

  function getCurrentPercent() {
    const progress = el('dial-progress');
    if (!progress) return 0;
    const offset = parseFloat(progress.getAttribute('stroke-dashoffset') || '0');
    return 100 - (offset / DIAL_CIRCUMFERENCE) * 100;
  }

  function cancelTest() {
    if (engine) engine.abort();
  }

  function copyShareLink() {
    const input = el('share-link');
    if (!input || !input.value) return;
    navigator.clipboard?.writeText(input.value).then(() => {
      const btn = el('copy-share-btn');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1500);
      }
    }).catch(() => {
      input.select();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!el('dial-progress')) return;
    initDialSvg();
    initChart();
    populateServerSelect();
    populateModeToggle();
    renderWarnings();
    loadNetworkInfo();
    renderSharedBanner();

    el('start-btn') && el('start-btn').addEventListener('click', startTest);
    el('cancel-btn') && el('cancel-btn').addEventListener('click', cancelTest);
    el('copy-share-btn') && el('copy-share-btn').addEventListener('click', copyShareLink);
  });
})();
