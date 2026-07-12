// ausbildung_script.js - Scraper for ausbildung.de
let isScraping = false;
let isPaused = false;
let targetLimit = 50;

const finishedSound = new Audio(chrome.runtime.getURL("finished.mp3"));
let settings = { notifyFinish: true };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Extract email from raw HTML — avoids DOMParser mailto: resolution issues
function extractEmailFromHtml(html) {
  const mailtoMatch = html.match(/href=["']mailto:([^"'?\s]+)/i);
  if (mailtoMatch) return mailtoMatch[1].trim();

  const emailMatch = html.match(
    /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})\b/,
  );
  if (emailMatch) return emailMatch[1].trim();

  return "";
}

// Extract company name — JSON-LD first, then DOM selectors
function extractCompanyFromDoc(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.hiringOrganization && item.hiringOrganization.name) {
          return item.hiringOrganization.name.trim();
        }
      }
    } catch (e) {}
  }

  const selectors = [
    ".jp-c-header__corporation-link",
    '[class*="corporation-link"]',
    '[class*="company-name"]',
    '[class*="employer"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (text && text.length < 120) return text;
    }
  }
  return "";
}

// Extract address — JSON-LD first, then specific selectors
function extractAddressFromDoc(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.jobLocation) {
          const loc = Array.isArray(item.jobLocation)
            ? item.jobLocation[0]
            : item.jobLocation;
          if (loc && loc.address) {
            const addr = loc.address;
            if (typeof addr === "string" && addr.trim()) return addr.trim();
            const street = addr.streetAddress || "";
            const postal = addr.postalCode || "";
            const city = addr.addressLocality || "";
            if (street) {
              const extra = [postal, city].filter(
                (p) => p && !street.includes(p),
              );
              return extra.length ? `${street}, ${extra.join(", ")}` : street;
            }
            const parts = [postal, city].filter(Boolean);
            if (parts.length) return parts.join(", ");
          }
        }
      }
    } catch (e) {}
  }

  const selectors = [
    ".jp-title__address",
    '[itemprop="addressLocality"]',
    '[class*="job-location"]',
    '[class*="location-text"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const text = el.textContent.replace(/📍/g, "").trim();
      if (text && text.length < 100) return text;
    }
  }
  return "";
}

// Extract all job detail links from a parsed document
function extractJobLinksFromDoc(doc) {
  const links = new Set();
  doc.querySelectorAll('a[href*="/stellen/"]').forEach((a) => {
    // getAttribute gives the raw href, avoiding chrome-extension:// resolution
    const href = a.getAttribute("href");
    if (!href) return;
    // Build absolute URL
    let url = href.startsWith("http")
      ? href
      : "https://www.ausbildung.de" + href;
    url = url.split("?")[0]; // strip query params
    if (url.includes("/stellen/") && !url.endsWith("/stellen/")) {
      links.add(url);
    }
  });
  return Array.from(links);
}

// Get job links from the live DOM (current page)
function getJobLinksFromPage() {
  return extractJobLinksFromDoc(document);
}

// Build the search URL for a given page number
// ausbildung.de uses ?page=N in the URL
function buildPageUrl(baseUrl, page) {
  const url = new URL(baseUrl);
  if (page > 1) {
    url.searchParams.set("page", page);
  } else {
    url.searchParams.delete("page");
  }
  return url.toString();
}

// Main scraping loop — fetches pages directly via URL pagination
async function handleSearchPage(limit = 50) {
  if (isScraping) return;
  isScraping = true;
  isPaused = false;
  targetLimit = limit;

  await sleep(1000);

  let currentData = await new Promise((r) => {
    chrome.storage.local.get(["scrapedData"], (res) =>
      r(res.scrapedData || []),
    );
  });

  const processedLinks = new Set();

  // Determine base search URL (strip page param)
  const baseUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    return url.toString();
  })();

  let page = 1;
  let emptyPageCount = 0;
  const MAX_EMPTY_PAGES = 10;

  while (isScraping && currentData.length < limit) {
    // Pause check
    while (isPaused) {
      await sleep(500);
      if (!isScraping) break;
    }
    if (!isScraping) break;

    // Fetch the search results page
    let pageDoc;
    if (page === 1) {
      // Use the live DOM for page 1 (already loaded)
      pageDoc = document;
    } else {
      const pageUrl = buildPageUrl(baseUrl, page);
      console.log(`[Ausbildung] Fetching page ${page}: ${pageUrl}`);
      try {
        const res = await fetch(pageUrl, { credentials: "include" });
        if (!res.ok) {
          console.warn("[Ausbildung] Page fetch failed:", res.status);
          break;
        }
        const html = await res.text();
        const parser = new DOMParser();
        pageDoc = parser.parseFromString(html, "text/html");
      } catch (err) {
        console.error("[Ausbildung] Error fetching page:", err);
        break;
      }
    }

    const jobLinks = extractJobLinksFromDoc(pageDoc).filter(
      (l) => !processedLinks.has(l),
    );
    console.log(
      `[Ausbildung] Page ${page}: found ${jobLinks.length} new job links`,
    );

    if (jobLinks.length === 0) {
      emptyPageCount++;
      if (emptyPageCount >= MAX_EMPTY_PAGES) {
        console.log(
          "[Ausbildung] No more results after",
          MAX_EMPTY_PAGES,
          "empty pages.",
        );
        break;
      }
      page++;
      continue;
    }

    emptyPageCount = 0;

    for (const jobUrl of jobLinks) {
      if (!isScraping || isPaused) break;
      if (currentData.length >= limit) break;

      processedLinks.add(jobUrl);

      try {
        const response = await fetch(jobUrl, { credentials: "include" });
        if (!response.ok) {
          console.warn(
            "[Ausbildung] Job fetch failed:",
            jobUrl,
            response.status,
          );
          continue;
        }

        const html = await response.text();
        const email = extractEmailFromHtml(html);
        if (!email) continue; // email is required

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const company = extractCompanyFromDoc(doc);
        const address = extractAddressFromDoc(doc);

        currentData.push({
          company,
          email,
          address,
          contact: "",
          anrede: "",
          link: jobUrl,
          phone: "",
        });

        await new Promise((r) =>
          chrome.storage.local.set({ scrapedData: currentData }, r),
        );
        chrome.runtime.sendMessage({
          action: "progress",
          count: currentData.length,
          currentTitle: company,
        });
        console.log(
          `[Ausbildung] Extracted (${currentData.length}/${limit}):`,
          { company, email },
        );
      } catch (err) {
        console.error("[Ausbildung] Error fetching job:", jobUrl, err);
      }

      await sleep(300);
    }

    // Move to next page after processing all links on this page
    if (currentData.length < limit) {
      page++;
    }
  }

  if (isScraping) {
    if (settings.notifyFinish) finishedSound.play().catch(() => {});
    chrome.runtime.sendMessage({
      action: "finished",
      count: currentData.length,
    });
  }
  isScraping = false;
  isPaused = false;
  chrome.storage.local.set({ isScraping: false, isPaused: false });
}

// Wrap with error propagation
const _handleSearchPage = handleSearchPage;
handleSearchPage = async function(limit) {
  try {
    await _handleSearchPage(limit);
  } catch (err) {
    console.error('[Ausbildung] Scraping error:', err);
    isScraping = false;
    isPaused = false;
    chrome.storage.local.set({ isScraping: false, isPaused: false });
    chrome.runtime.sendMessage({ action: 'error', message: String(err) });
  }
};

// Count available results
async function countResults() {
  await sleep(800);

  const headlineSelectors = [
    '[class*="headline"]',
    '[class*="result-count"]',
    '[class*="SearchResults"] h1',
    '[class*="SearchResults"] h2',
    '[data-testid="search-result-title"]',
    "h1",
    "h2",
  ];

  for (const sel of headlineSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = el.innerText || el.textContent || "";
    const match = text.match(
      /([\d.,]+)\s*(freie|Ausbildung|Stellen|Ergebnisse|results)/i,
    );
    if (match) return parseInt(match[1].replace(/[.,]/g, ""), 10);
    const numMatch = text.match(/^([\d.,]+)/);
    if (numMatch) return parseInt(numMatch[1].replace(/[.,]/g, ""), 10);
  }

  return getJobLinksFromPage().length;
}

// Listen for popup actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.settings) {
    settings = request.settings;
  }

  if (request.action === "countResults") {
    countResults().then((total) => sendResponse({ total }));
    return true;
  }
  if (request.action === "reset") {
    isScraping = false;
    isPaused = false;
    chrome.storage.local.set({ scrapedData: [] }, () => {
      sendResponse({ status: "reset" });
    });
    return true;
  }
  if (request.action === "start") {
    const limit = request.limit || 50;
    if (!isScraping) {
      handleSearchPage(limit);
    }
    sendResponse({ status: "started" });
    return true;
  }
  if (request.action === "pause") {
    isPaused = true;
    sendResponse({ status: "paused" });
    return true;
  }
  if (request.action === "resume") {
    isPaused = false;
    sendResponse({ status: "resumed" });
    return true;
  }
  if (request.action === "stop") {
    isScraping = false;
    isPaused = false;
    sendResponse({ status: "stopped" });
    return true;
  }
  if (request.action === "getInitialInfo") {
    chrome.storage.local.get(["scrapedData"], (res) => {
      const scount = res.scrapedData ? res.scrapedData.length : 0;
      sendResponse({ isScraping, isPaused, scrapedCount: scount });
    });
    return true;
  }
  if (request.action === "getData") {
    chrome.storage.local.get(["scrapedData"], (res) => {
      sendResponse({ data: res.scrapedData || [] });
    });
    return true;
  }
});
