<p align="center">
  <img src="icons/icon128.png" alt="AutoAzubi Logo" width="80" />
</p>

<h1 align="center">AutoAzubi Extractor</h1>

<p align="center">
  <strong>Automated Ausbildung lead extraction from Germany's top apprenticeship portals.</strong><br />
  Scrape job listings, company contacts, and email addresses — then export everything as a clean, deduplicated CSV.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/version-1.1-green?style=flat-square" alt="Version 1.1" />
  <img src="https://img.shields.io/badge/languages-EN%20%7C%20AR-orange?style=flat-square" alt="Languages" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="License" />
</p>

---

## ✨ Key Features

- **Multi-portal scraping** — Extract from 5 German job & business portals in one extension
- **Smart email discovery** — 9 regex strategies + Impressum/Kontakt crawling fallback for hard-to-find emails
- **Automatic pagination** — URL-based pagination for ausbildung.de and azubi.de, no manual clicking required
- **Deduplication** — Duplicate emails are automatically removed before CSV export
- **Real-time dashboard** — Progress ring, elapsed time, speed metrics, and ETA
- **Pause & resume** — Pause mid-scrape and resume from the exact position
- **Bilingual UI** — Full English and Arabic (RTL) support
- **Dark mode** — Toggle between light and dark themes
- **State persistence** — Scraped data is stored in `chrome.storage.local` and survives popup close/reopen

---

## 🌐 Supported Portals

| Portal | Data Extracted | Pagination |
| --- | --- | --- |
| [Arbeitsagentur.de](https://www.arbeitsagentur.de) | Company, email, phone, address, contact person, salutation | Manual navigation |
| [Ausbildung.de](https://www.ausbildung.de) | Company, email, address, listing URL | Automatic (`?page=N`) |
| [Aubi-Plus.de](https://www.aubi-plus.de) | Company, email, phone, address | Automatic |
| [Azubi.de](https://www.azubi.de) | Company, email, phone, address, listing URL | Automatic (`?page=N`) |
| [DasÖrtliche.de](https://www.dasoertliche.de) | Company, email, phone, address, website | Via Google Maps tab |

> **Note:** Ausbildung.de and Azubi.de only collect listings with a publicly visible email address.

---

## 📦 Installation

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- Developer mode enabled

### Steps

1. Clone or download this repository
2. Open `chrome://extensions/` in your browser
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `autoAzubi/` folder
5. The AutoAzubi icon will appear in your toolbar — you're ready to go

---

## 🚀 Quick Start

1. Click the **AutoAzubi** icon in your toolbar
2. Choose a portal from the **Open Portal** section (or use the **Google Maps** tab for business directory searches)
3. Navigate to a search results page on the portal
4. Set your **Extraction Limit** (default: 50)
5. Click **Start Extraction**
6. When finished, click **Export Data** to download your CSV

### Per-Portal Usage

<details>
<summary><strong>Arbeitsagentur.de</strong></summary>

1. Click **Arbeitsagentur** to open the job search page
2. Navigate to an Ausbildung search results page
3. Click **Count Offers** to see available results
4. Set your extraction limit and click **Start Extraction**
5. If a CAPTCHA appears, solve it manually — the scraper resumes automatically
6. Export your results when complete

</details>

<details>
<summary><strong>Ausbildung.de</strong></summary>

1. Click **Ausbildung.de** to open the portal
2. Search for a job title, location, or category
3. Set your extraction limit and click **Start Extraction**
4. The extension fetches each detail page in the background and paginates automatically
5. Export your results when complete

</details>

<details>
<summary><strong>Aubi-Plus.de</strong></summary>

1. Click **Aubi-Plus.de** to open the portal
2. Navigate to a search results page
3. Click **Start Extraction** — pagination is handled automatically
4. Export your results when complete

</details>

<details>
<summary><strong>Azubi.de</strong></summary>

1. Click **Azubi.de** to open `https://www.azubi.de/ausbildungsplatz`
2. Use the site's search and filters to narrow results
3. Set your extraction limit and click **Start Extraction**
4. The extension fetches each detail page and paginates automatically
5. Export your results when complete

</details>

<details>
<summary><strong>Google Maps / DasÖrtliche (Business Directory)</strong></summary>

1. Switch to the **Google Maps** tab in the popup
2. Enter a **keyword** (industry/business type) and a **city or location**
3. Click **Search on Google Maps** — a DasÖrtliche search opens in a new tab
4. Return to the extension popup and click **Start Extraction**

**Multi-step email extraction:**

1. Checks the DasÖrtliche detail page for email (9 extraction patterns including obfuscated and encoded emails)
2. If no email is found, extracts the company's website URL
3. Crawls `/impressum`, `/kontakt`, and `/imprint` pages (German law requires contact info in the Impressum)
4. Only saves businesses where an email was successfully found

**Suggested search keywords:**

| Industry | Keywords |
| --- | --- |
| IT / Tech | `Softwareentwicklung`, `IT-Unternehmen`, `EDV`, `Systemhaus`, `Webdesign` |
| SHK / HVAC | `SHK`, `Sanitär`, `Heizungsbau`, `Klempner`, `Haustechnik`, `Installateur` |

> **Tip:** Industries where businesses regularly publish emails (e.g. medical practices, care facilities) yield faster results. The Impressum crawling fallback significantly increases coverage for industries with lower email publication rates.

</details>

---

## 🎮 Controls

| Control | Description |
| --- | --- |
| **Start Extraction** | Begin scraping up to the configured extraction limit |
| **Count Offers** | Count total available results on the current page |
| **Pause** | Pause after the current item — resume from the exact position |
| **Resume** | Continue scraping from where it was paused |
| **Stop** | Stop scraping and keep all collected data |
| **Reset** | Clear all collected data (with confirmation dialog) |
| **Export Data** | Download all scraped data as a deduplicated `.csv` file |

---

## 📄 CSV Output

Exported files are named `autoazubi_leads_YYYY-MM-DD.csv` with the following schema:

| Column | Field | Source |
| --- | --- | --- |
| A | Company Name | All portals |
| B | Email | All portals |
| C | Street | All portals |
| D | PLZ | All portals |
| E | City | All portals |
| F | Ansprechpartner | Arbeitsagentur only |
| G | Website / Listing URL | DasÖrtliche, Ausbildung.de, Azubi.de |
| H | Telephone | DasÖrtliche, Aubi-Plus.de |
| I | Source Portal | All portals |
| J | Extracted Date | All portals |

**Deduplication rules:**
- Entries with email → deduplicated by email (case-insensitive)
- Entries without email → deduplicated by company name + address

---

## ⚙️ Settings

| Setting | Description |
| --- | --- |
| **Captcha Sound** | Plays an audio alert every 4 seconds when a CAPTCHA is detected on Arbeitsagentur |
| **Finish Sound** | Plays an audio alert when scraping completes |

---

## 🌍 Localization

The popup UI supports **English** and **Arabic (RTL)**. Toggle between languages using the **EN** / **عربي** buttons in the header.

---

## 🗂️ Project Structure

```
autoAzubi/
├── manifest.json             # Chrome extension manifest (MV3)
├── popup.html                # Popup UI layout
├── popup.js                  # Popup logic, i18n, state management, CSV export
├── styles.css                # UI styles (light/dark themes)
├── background.js             # Service worker — fetch proxies for ISO-8859-1 & UTF-8 encoding
├── utils.js                  # Shared utility functions
├── content_script.js         # Scraper: arbeitsagentur.de
├── ausbildung_script.js      # Scraper: ausbildung.de (URL-based pagination)
├── aubiplus_script.js        # Scraper: aubi-plus.de
├── azubi_script.js           # Scraper: azubi.de (URL-based pagination)
├── gmaps_script.js           # Scraper: DasÖrtliche.de + Impressum/Kontakt fallback
├── captcha.mp3               # CAPTCHA detection alert sound
├── finished.mp3              # Scraping completion sound
└── icons/
    ├── icon16.png            # Toolbar icon (16×16)
    ├── icon48.png            # Extension management icon (48×48)
    ├── icon128.png           # Chrome Web Store icon (128×128)
    └── gmaps-hero.jpg        # Google Maps tab hero banner
```

---

## 🔧 Technical Details

<details>
<summary><strong>Architecture & Implementation Notes</strong></summary>

| Area | Details |
| --- | --- |
| **Pagination** | Ausbildung.de and Azubi.de use URL-based pagination (`?page=N`) — pages are fetched directly via `fetch()` with session cookies, no DOM interaction required |
| **Email extraction** | 9 regex strategies on raw HTML: plain text, obfuscated (`[at]`, `(dot)`), entity-encoded, `data-email` attributes, and `onclick`-embedded patterns. Avoids `DOMParser` to prevent `mailto:` links resolving to `chrome-extension://` URLs |
| **Impressum crawling** | When no email is found on DasÖrtliche, the scraper extracts the company's website URL and fetches `/impressum`, `/kontakt`, and `/imprint` pages with a 5-second timeout per request |
| **Address extraction** | Uses JSON-LD structured data (`application/ld+json`) as primary source, with DOM selector fallbacks |
| **Request throttling** | 100 ms between detail page fetches, 200 ms between list pages — network round-trip provides additional natural throttling |
| **Fetch timeout** | External website fetches abort after 5 seconds to prevent blocking on slow or unresponsive sites |
| **State persistence** | All scraped data is stored in `chrome.storage.local` — data persists across popup close/reopen cycles |
| **Encoding support** | DasÖrtliche scraping runs via the service worker fetch proxy (required for ISO-8859-1 encoding); external website crawling uses a separate UTF-8 fetch proxy |

</details>

---

<p align="center">
  Built with ❤️ for the German apprenticeship market
</p>
