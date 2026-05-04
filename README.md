# AutoAzubi Extractor

A Chrome extension that automatically scrapes Ausbildung (apprenticeship) job listings from multiple German job portals and exports the results as a CSV file.

---

## Supported Sites

| Site | What it scrapes |
|------|----------------|
| [arbeitsagentur.de](https://www.arbeitsagentur.de) | Job listings with company, email, phone, address, contact person |
| [ausbildung.de](https://www.ausbildung.de) | Apprenticeship listings with company, email, address |
| [aubi-plus.de](https://www.aubi-plus.de) | Apprenticeship listings with company, email, phone, address |
| [Google Maps → DasÖrtliche.de](https://www.dasoertliche.de) | Business listings with company, email, phone, address |

---

## Installation (Local / Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `scrabb extension/` folder
6. The extension icon will appear in your toolbar

---

## How to Use

### Arbeitsagentur.de
1. Click the extension icon
2. Click **Open Arbeitsagentur** — it opens the job search page
3. Navigate to a search results page (Ausbildung listings)
4. Click **Count Available** to see how many results are on the page
5. Set your **Target Number of Offers**
6. Click **Start Scraping**
7. If a captcha appears, solve it manually — the scraper will resume automatically
8. When finished, click **Download CSV Results**

### Ausbildung.de
1. Click **Open Ausbildung.de** from the popup
2. Navigate to a search results page
3. Click **Start Scraping** — the extension fetches each job detail page in the background
4. Download results when done

### Aubi-Plus.de
1. Click **Open Aubi-Plus.de** from the popup
2. Navigate to a search results page
3. Click **Start Scraping** — the extension paginates automatically
4. Download results when done

### Google Maps / DasÖrtliche
1. Click **Open Google Maps** from the popup
2. Enter a **Keyword** (e.g. `Bäckerei`) and a **City** (e.g. `Berlin`)
3. Click **Search on Maps** — a Google Maps search tab opens
4. Go back to the extension popup and click **Start Scraping**
5. The extension scrapes matching businesses from DasÖrtliche.de in the background

---

## Controls

| Button | Action |
|--------|--------|
| **Count Available** | Applies filters and counts total results on the current page |
| **Start Scraping** | Begins extraction up to the target number |
| **Pause** | Pauses after the current item |
| **Resume** | Continues from where it paused |
| **Stop** | Stops scraping and keeps collected data |
| **Reset** | Clears all collected data |
| **Download CSV** | Exports all scraped data as a `.csv` file |

---

## CSV Output Format

The exported file is named `scraped_jobs_YYYY-MM-DD.csv` with the following columns:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Company Name | Email | Address | Ansprechpartner | Anrede | Website | Telephone |

> Only entries **with an email address** are included in the output.
> `Ansprechpartner` and `Anrede` are only populated for Arbeitsagentur listings.

---

## Settings

- **Captcha Sound** — plays an audio alert every 4 seconds when a captcha is detected on Arbeitsagentur
- **Finish Sound** — plays an audio alert when scraping completes

---

## Languages

The popup UI supports **English** and **Arabic (RTL)** — toggle with the EN / عربي buttons at the top of the popup.

---

## File Structure

```
scrabb extension/
├── manifest.json           # Extension manifest (MV3)
├── popup.html              # Popup UI
├── popup.js                # Popup logic, i18n, CSV export
├── styles.css              # Popup styles
├── background.js           # Service worker (fetch proxy for DasÖrtliche)
├── content_script.js       # Scraper for arbeitsagentur.de
├── ausbildung_script.js    # Scraper for ausbildung.de
├── aubiplus_script.js      # Scraper for aubi-plus.de
├── gmaps_script.js         # Scraper for Google Maps / DasÖrtliche.de
├── captcha.mp3             # Captcha alert sound
├── finished.mp3            # Completion sound
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Notes

- The extension only scrapes entries that have a **publicly visible email address**
- A 1–2 second delay is added between requests to avoid overwhelming the target servers
- Scraping state is persisted in `chrome.storage.local` — if you refresh the page mid-scrape, it will resume automatically on Arbeitsagentur
- The DasÖrtliche scraper runs entirely in the background (no tab navigation required)
