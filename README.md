# AutoAzubi Extractor

A Chrome extension that automatically scrapes Ausbildung (apprenticeship) job listings and business contacts from multiple German portals and exports the results as a deduplicated CSV file.

---

## Supported Sites

| Site                                               | What it scrapes                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [arbeitsagentur.de](https://www.arbeitsagentur.de) | Job listings with company, email, phone, address, contact person                                    |
| [ausbildung.de](https://www.ausbildung.de)         | Apprenticeship listings with company, email, address — paginates automatically via `?page=N`        |
| [aubi-plus.de](https://www.aubi-plus.de)           | Apprenticeship listings with company, email, phone, address                                         |
| [azubi.de](https://www.azubi.de)                   | Apprenticeship listings with company, email, phone, address — paginates automatically via `?page=N` |
| [DasÖrtliche.de](https://www.dasoertliche.de)      | Business directory listings with company, email, phone, address (accessed via Google Maps popup)    |

---

## Installation (Local / Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `scraping extension/` folder
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
2. Navigate to a search results page (e.g. search for a job title or location)
3. Set your **Target Number of Offers**
4. Click **Start Scraping** — the extension fetches each job detail page in the background and paginates automatically
5. Download results when done

> Only listings with a **publicly visible email address** are collected.

### Aubi-Plus.de

1. Click **Open Aubi-Plus.de** from the popup
2. Navigate to a search results page
3. Click **Start Scraping** — the extension paginates automatically
4. Download results when done

### Azubi.de

1. Click **Open Azubi.de** from the popup — opens `https://www.azubi.de/ausbildungsplatz`
2. Use the site's search/filter to narrow results (job title, location, etc.)
3. Set your **Target Number of Offers**
4. Click **Start Scraping** — the extension fetches each job detail page and paginates automatically
5. Download results when done

> Only listings with a **publicly visible email address** are collected.

### Google Maps / DasÖrtliche (Business Directory)

1. Click **Open Google Maps** from the popup
2. Enter a **Keyword** (business type) and a **City**
3. Click **Search on Maps** — a Google Maps search tab opens
4. Go back to the extension popup and click **Start Scraping**
5. The extension scrapes matching businesses from DasÖrtliche.de in the background

**Good keywords for IT/tech apprenticeships:**

- `Softwareentwicklung`, `IT-Unternehmen`, `EDV`, `Systemhaus`, `Webdesign`

**Good keywords for SHK (Sanitär/Heizung/Klima) apprenticeships:**

- `SHK`, `Sanitär`, `Heizungsbau`, `Klempner`, `Haustechnik`, `Installateur`

> The scraper only collects businesses that have a **publicly visible email** on DasÖrtliche.
> Categories with high email publication rates (e.g. Altenheim, Arzt) will complete faster than categories where businesses rarely publish emails (e.g. Softwareentwicklung).

---

## Controls

| Button              | Action                                                       |
| ------------------- | ------------------------------------------------------------ |
| **Count Available** | Applies filters and counts total results on the current page |
| **Start Scraping**  | Begins extraction up to the target number                    |
| **Pause**           | Pauses after the current item (resumes from exact position)  |
| **Resume**          | Continues from where it paused                               |
| **Stop**            | Stops scraping and keeps collected data                      |
| **Reset**           | Clears all collected data                                    |
| **Download CSV**    | Exports all scraped data as a deduplicated `.csv` file       |

---

## CSV Output Format

The exported file is named `scraped_jobs_YYYY-MM-DD.csv` with the following columns:

| A            | B     | C       | D               | E      | F       | G         |
| ------------ | ----- | ------- | --------------- | ------ | ------- | --------- |
| Company Name | Email | Address | Ansprechpartner | Anrede | Website | Telephone |

**Notes:**

- The CSV is **automatically deduplicated** before export — duplicate emails are removed, keeping only the first occurrence
- `Ansprechpartner` and `Anrede` are only populated for Arbeitsagentur listings
- `Website` column contains the job listing URL for ausbildung.de / azubi.de entries
- `Telephone` is populated for DasÖrtliche and aubi-plus.de entries

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
scraping extension/
├── manifest.json           # Extension manifest (MV3)
├── popup.html              # Popup UI
├── popup.js                # Popup logic, i18n, CSV export (with deduplication)
├── styles.css              # Popup styles
├── background.js           # Service worker (fetch proxy for DasÖrtliche ISO-8859-1 decoding)
├── content_script.js       # Scraper for arbeitsagentur.de
├── ausbildung_script.js    # Scraper for ausbildung.de (URL-based pagination)
├── aubiplus_script.js      # Scraper for aubi-plus.de
├── azubi_script.js         # Scraper for azubi.de (URL-based pagination)
├── gmaps_script.js         # Scraper for DasÖrtliche.de (via Google Maps tab)
├── captcha.mp3             # Captcha alert sound
├── finished.mp3            # Completion sound
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Technical Notes

- **Pagination**: ausbildung.de and azubi.de use URL-based pagination (`?page=N`) — the scraper fetches pages directly via `fetch()` with session cookies, no DOM clicking required
- **Email extraction**: Uses regex on raw HTML to avoid `DOMParser` resolving `mailto:` links to `chrome-extension://` URLs
- **Address extraction**: Uses JSON-LD structured data (`application/ld+json`) as primary source, with DOM selector fallbacks
- **Deduplication**: CSV export deduplicates by email (case-insensitive); entries without email are deduplicated by company+address
- **Delays**: 200–500ms between requests to avoid rate limiting
- **State persistence**: Scraped data is stored in `chrome.storage.local` — data survives popup close/reopen
- **DasÖrtliche**: Scraping runs entirely in the background via the service worker fetch proxy (required for ISO-8859-1 encoding support)
