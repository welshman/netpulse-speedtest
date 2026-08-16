/**
 * speedtest.js
 * Core client-side speed test engine.
 *
 * Uses Cloudflare's public, CORS-enabled speed test endpoints:
 *   - Download: https://speed.cloudflare.com/__down?bytes=<n>
 *   - Upload:   https://speed.cloudflare.com/__up   (POST body of <n> bytes)
 *   - Trace:    https://speed.cloudflare.com/cdn-cgi/trace  (latency + edge meta)
 *
 * Also supports alternate public test servers for "best server" auto-selection.
 * All requests are plain fetch() calls — no server-side code, no WebSockets.
 */

const SERVERS = [
  {
    id: 'cf',
    name: 'Cloudflare (speed.cloudflare.com)',
    downUrl: 'https://speed.cloudflare.com/__down?bytes=',
    upUrl: 'https://speed.cloudflare.com/__up',
    traceUrl: 'https://speed.cloudflare.com/cdn-cgi/trace',
    region: 'Global (Anycast)'
  },
  {
    id: 'cf-1111',
    name: 'Cloudflare (1.1.1.1 edge)',
    downUrl: 'https://speed.cloudflare.com/__down?bytes=',
    upUrl: 'https://speed.cloudflare.com/__up',
    traceUrl: 'https://1.1.1.1/cdn-cgi/trace',
    region: 'Global (Anycast)'
  },
  {
    id: 'cf-dns',
    name: 'Cloudflare DNS edge',
    downUrl: 'https://speed.cloudflare.com/__down?bytes=',
    upUrl: 'https://speed.cloudflare.com/__up',
    traceUrl: 'https://cloudflare-dns.com/cdn-cgi/trace',
    region: 'Global (Anycast)'
  }
];

const DOWNLOAD_SIZES = [101000, 1001000, 10001000, 25001000, 50001000, 100001000];
const DOWNLOAD_SIZES_LITE = [101000, 1001000, 5001000];

const UPLOAD_SIZES = [100000, 1000000, 5000000, 10000000];
const UPLOAD_SIZES_LITE = [100000, 1000000];

const bitsToMbps = (bytes, seconds) => (bytes * 8) / (seconds * 1_000_000);

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function average(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stddev(arr) {
  if (arr.length < 2) return 0;
  const avg = average(arr);
  const sq = arr.map((v) => (v - avg) ** 2);
  return Math.sqrt(average(sq));
}

function makeUploadPayload(sizeBytes) {
  const seed = new Uint8Array(65536);
  for (let i = 0; i < seed.length; i++) seed[i] = (i * 97 + 13) & 0xff;
  const buffer = new Uint8Array(sizeBytes);
  for (let offset = 0; offset < sizeBytes; offset += seed.length) {
    buffer.set(seed.subarray(0, Math.min(seed.length, sizeBytes - offset)), offset);
  }
  return buffer;
}

class SpeedTestEngine {
  constructor(opts = {}) {
    this.onProgress = opts.onProgress || (() => {});
    this.onSample = opts.onSample || (() => {});
    this.onPhaseChange = opts.onPhaseChange || (() => {});
    this.settings = opts.settings || window.Storage.getSettings();
    this.aborted = false;
    this.controller = null;
    this.server = SERVERS.find((s) => s.id === this.settings.defaultServerId) || null;
  }

  abort() {
    this.aborted = true;
    if (this.controller) this.controller.abort();
  }

  getServers() { return SERVERS; }

  async selectBestServer() {
    if (this.settings.defaultServerId && this.settings.defaultServerId !== 'auto') {
      const pinned = SERVERS.find((s) => s.id === this.settings.defaultServerId);
      if (pinned) { this.server = pinned; return { server: pinned, results: [] }; }
    }

    this.onPhaseChange('selecting-server');
    const results = [];
    for (const server of SERVERS) {
      try {
        const samples = await this._pingServer(server, 3);
        results.push({ server, median: median(samples), samples });
      } catch (e) {
        results.push({ server, median: Infinity, samples: [], error: true });
      }
    }
    results.sort((a, b) => a.median - b.median);
    this.server = results[0].server;
    return { server: this.server, results };
  }

  async _pingServer(server, samples = 10) {
    const times = [];
    for (let i = 0; i < samples; i++) {
      if (this.aborted) break;
      const url = server.traceUrl + (server.traceUrl.includes('?') ? '&' : '?') + 'cache_bust=' + Math.random();
      const t0 = performance.now();
      try {
        await fetch(url, { cache: 'no-store', mode: 'cors' });
        times.push(performance.now() - t0);
      } catch (e) {
        times.push(9999);
      }
    }
    return times;
  }

  async runLatencyTest(server, sampleCount = 12) {
    this.onPhaseChange('ping');
    const raw = await this._pingServer(server, sampleCount);
    const valid = raw.filter((t) => t < 9999);
    const jitterSamples = [];
    for (let i = 1; i < valid.length; i++) jitterSamples.push(Math.abs(valid[i] - valid[i - 1]));

    return {
      samples: raw,
      min: valid.length ? Math.min(...valid) : null,
      max: valid.length ? Math.max(...valid) : null,
      avg: average(valid),
      median: median(valid),
      jitter: average(jitterSamples),
      packetLoss: raw.length ? (raw.length - valid.length) / raw.length : 0
    };
  }

  async runDownloadTest() {
    this.onPhaseChange('download');
    const sizes = this.settings.testMode === 'quick' ? DOWNLOAD_SIZES_LITE : DOWNLOAD_SIZES;
    const threads = Math.max(1, Math.min(8, this.settings.threads || 4));
    const durationBudgetMs = (this.settings.duration || 10) * 1000;

    const measurements = [];
    const startAll = performance.now();
    let sizeIndex = 0;

    while (performance.now() - startAll < durationBudgetMs && sizeIndex < sizes.length && !this.aborted) {
      const size = sizes[sizeIndex];
      const roundStart = performance.now();
      const promises = [];
      for (let t = 0; t < threads; t++) {
        promises.push(this._downloadChunk(size));
      }
      const results = await Promise.all(promises);
      const roundElapsedSec = (performance.now() - roundStart) / 1000;
      const totalBytes = results.reduce((sum, r) => sum + (r ? r.bytes : 0), 0);

      if (totalBytes > 0 && roundElapsedSec > 0) {
        const mbps = bitsToMbps(totalBytes, roundElapsedSec);
        measurements.push({ bytes: totalBytes, seconds: roundElapsedSec, mbps, sizeStep: size });
        const elapsedTotal = performance.now() - startAll;
        this.onSample({ phase: 'download', timestampMs: elapsedTotal, mbps });
        this.onProgress({
          phase: 'download',
          percent: Math.min(100, (elapsedTotal / durationBudgetMs) * 100),
          currentMbps: mbps,
          elapsed: elapsedTotal
        });
      }
      sizeIndex++;
      if (sizeIndex >= sizes.length && performance.now() - startAll < durationBudgetMs) {
        sizeIndex = sizes.length - 1;
      }
    }

    return this._summarize(measurements);
  }

  async _downloadChunk(sizeBytes) {
    if (this.aborted || !this.server) return null;
    const url = this.server.downUrl + sizeBytes + '&cache_bust=' + Math.random().toString(36).slice(2);
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const ms = performance.now() - t0;
      return { bytes: buf.byteLength, ms };
    } catch (e) {
      return null;
    }
  }

  async runUploadTest() {
    this.onPhaseChange('upload');
    const sizes = this.settings.testMode === 'quick' ? UPLOAD_SIZES_LITE : UPLOAD_SIZES;
    const threads = Math.max(1, Math.min(6, this.settings.threads || 4));
    const durationBudgetMs = (this.settings.duration || 10) * 1000;

    const measurements = [];
    const startAll = performance.now();
    let sizeIndex = 0;

    while (performance.now() - startAll < durationBudgetMs && sizeIndex < sizes.length && !this.aborted) {
      const size = sizes[sizeIndex];
      const payload = makeUploadPayload(size);
      const roundStart = performance.now();
      const promises = [];
      for (let t = 0; t < threads; t++) {
        promises.push(this._uploadChunk(payload));
      }
      const results = await Promise.all(promises);
      const roundElapsedSec = (performance.now() - roundStart) / 1000;
      const totalBytes = results.reduce((sum, r) => sum + (r ? r.bytes : 0), 0);

      if (totalBytes > 0 && roundElapsedSec > 0) {
        const mbps = bitsToMbps(totalBytes, roundElapsedSec);
        measurements.push({ bytes: totalBytes, seconds: roundElapsedSec, mbps, sizeStep: size });
        const elapsedTotal = performance.now() - startAll;
        this.onSample({ phase: 'upload', timestampMs: elapsedTotal, mbps });
        this.onProgress({
          phase: 'upload',
          percent: Math.min(100, (elapsedTotal / durationBudgetMs) * 100),
          currentMbps: mbps,
          elapsed: elapsedTotal
        });
      }
      sizeIndex++;
      if (sizeIndex >= sizes.length && performance.now() - startAll < durationBudgetMs) {
        sizeIndex = sizes.length - 1;
      }
    }

    return this._summarize(measurements);
  }

  async _uploadChunk(payload) {
    if (this.aborted || !this.server) return null;
    const t0 = performance.now();
    try {
      const res = await fetch(this.server.upUrl, {
        method: 'POST',
        body: payload,
        cache: 'no-store',
        mode: 'cors'
      });
      await res.arrayBuffer().catch(() => null);
      const ms = performance.now() - t0;
      if (!res.ok && res.status !== 0) return null;
      return { bytes: payload.byteLength, ms };
    } catch (e) {
      return null;
    }
  }

  _summarize(measurements) {
    const mbpsValues = measurements.map((m) => m.mbps);
    if (!mbpsValues.length) {
      return { mbps: 0, mBps: 0, median: 0, average: 0, min: 0, max: 0, samples: [] };
    }
    return {
      mbps: median(mbpsValues),
      mBps: median(mbpsValues) / 8,
      median: median(mbpsValues),
      average: average(mbpsValues),
      min: Math.min(...mbpsValues),
      max: Math.max(...mbpsValues),
      stddev: stddev(mbpsValues),
      samples: measurements
    };
  }

  async estimatePacketLoss(server, count = 20, timeoutMs = 800) {
    this.onPhaseChange('packet-loss');
    let lost = 0;
    const attempts = [];
    for (let i = 0; i < count; i++) {
      attempts.push(
        (async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const url = server.traceUrl + (server.traceUrl.includes('?') ? '&' : '?') + 'pl=' + Math.random();
            await fetch(url, { signal: controller.signal, cache: 'no-store', mode: 'cors' });
          } catch (e) {
            lost++;
          } finally {
            clearTimeout(timer);
          }
        })()
      );
    }
    await Promise.all(attempts);
    return { lossPercent: (lost / count) * 100, attempted: count, lost };
  }

  async runFullTest() {
    this.aborted = false;
    const { server, results: serverResults } = await this.selectBestServer();
    const latency = await this.runLatencyTest(server, this.settings.testMode === 'quick' ? 6 : 14);
    const download = await this.runDownloadTest();
    const upload = await this.runUploadTest();
    let packetLoss = null;
    if (this.settings.testMode !== 'quick') {
      packetLoss = await this.estimatePacketLoss(server, 20, 800);
    }
    this.onPhaseChange('done');

    return {
      server: { id: server.id, name: server.name, region: server.region },
      serverSelection: serverResults.map((r) => ({ id: r.server.id, medianPingMs: r.median === Infinity ? null : Math.round(r.median * 100) / 100 })),
      latency,
      download,
      upload,
      packetLoss,
      testMode: this.settings.testMode,
      timestamp: Date.now()
    };
  }
}

window.SpeedTestEngine = SpeedTestEngine;
window.SPEEDTEST_SERVERS = SERVERS;
