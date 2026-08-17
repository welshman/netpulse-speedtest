# NetPulse — Client-Side Internet Speed Test

A fully static, client-side internet speed test that runs entirely on **GitHub Pages** — no backend, no database, no server-side code. It measures download speed, upload speed, ping, jitter, and estimated packet loss directly in the browser using Cloudflare's public, CORS-enabled speed test endpoints.

**Live demo:** https://welshman.github.io/netpulse-speedtest/.

## Features

- **Download test** — multiple parallel connections, adaptive payload sizes (100 KB → 100 MB), median/average/min/max reporting.
- **Upload test** — progressive payload sizes, parallel connections, same statistical reporting.
- **Latency & jitter** — multiple ping samples against `/cdn-cgi/trace`, with min/avg/median/max and jitter (mean absolute deviation).
- **Packet loss estimate** — best-effort approximation via concurrent timed requests (browsers can't send raw ICMP).
- **Auto server selection** — pings all known servers and picks the lowest-latency one, or choose manually.
- **Quick vs Full test modes** — fast overview or a deeper, longer-running measurement.
- **Live line chart** of speed over time (Chart.js via CDN).
- **History page** — all runs saved to `localStorage`, with view/delete per entry and "clear all".
- **Shareable result links** — results are base64-encoded into the URL hash; nothing is uploaded to generate a share link.
- **Network info panel** — public IP, ISP/org, approximate location (via ipapi.co), connection type hints, and user agent.
- **Settings page** — test duration, thread count, default server, units (Mbps/MB/s), light/dark theme.
- **Connection quality score** — simple 0–100 heuristic combining download, upload, ping, jitter, and loss.
- **Accessible, responsive UI** — keyboard-navigable, ARIA labels, reduced-motion support, dark mode.

## Project Structure

```
.
├── index.html          # Home / Test page
├── results.html         # History page
├── about.html            # How it works, accuracy notes, privacy info
├── settings.html         # Test configuration
├── css/
│   └── styles.css        # Design system + layout (vanilla CSS, no build step)
├── js/
│   ├── storage.js         # localStorage: settings, theme, history
│   ├── speedtest.js       # Core speed test engine (download/upload/ping/loss)
│   ├── ui.js               # Shared nav/theme bindings + formatting helpers
│   ├── main.js              # Home page: dial, chart, network info, orchestration
│   ├── results.js           # History page logic
│   └── settings.js          # Settings page logic
└── assets/
    └── favicon.svg
```

No build step, no `node_modules`, no bundler — every file is served as-is. The only external dependency is Chart.js, loaded from a CDN (`cdn.jsdelivr.net`) in `index.html`.

## How the speed test works

- **Download**: fetches `https://speed.cloudflare.com/__down?bytes=<n>` in parallel across several connections, stepping through increasing sizes, and reports the median throughput across all rounds.
- **Upload**: `POST`s randomly-generated payloads to `https://speed.cloudflare.com/__up` the same way.
- **Ping/jitter**: times repeated fetches to `https://speed.cloudflare.com/cdn-cgi/trace` (and alternate Cloudflare edge hostnames for server selection).
- **Packet loss**: fires ~20 small concurrent requests with an 800 ms timeout and counts failures — an estimate, not a true ICMP measurement.

Full methodology and limitations are documented on the **About** page.

## Deployment to GitHub Pages

1. **Create the repo** (already done if you're reading this in it) or, for a fresh copy:
   ```bash
   git clone https://github.com/<your-username>/<repo-name>.git
   cd <repo-name>
   ```
2. **Add/commit files** if working locally:
   ```bash
   git add .
   git commit -m "Add NetPulse speed test site"
   git push origin main
   ```
3. **Enable GitHub Pages**:
   - Go to your repo on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment**, set **Source** to `Deploy from a branch`.
   - Choose branch `main` and folder `/ (root)`, then **Save**.
   - GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/` within a minute or two.
4. **Custom domain (optional)**: add a `CNAME` file at the repo root containing your domain, and configure a `CNAME` DNS record pointing to `<your-username>.github.io`. No base-path changes are needed since all links in this project are relative.

## Notes on accuracy

Browser-based tests are a good, convenient estimate — not a lab-grade measurement. They're bounded by TCP slow start, JS/OS overhead, and the fact that you're measuring the path to Cloudflare's edge rather than a dedicated ISP test node. See the **About** page for the full breakdown and tips for getting the most consistent readings (wired connection, no VPN, idle network).

## License

Feel free to use, modify, and deploy this project for personal or commercial use.
