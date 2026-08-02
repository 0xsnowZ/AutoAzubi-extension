// azubi_script.js - Scraper for azubi.de
let isScraping = false;
let isPaused = false;
let targetLimit = 50;

const finishedSound = new Audio(chrome.runtime.getURL("finished.mp3"));
let settings = { notifyFinish: true };

// sleep, extractEmailFromHtml, extractPhoneFromHtml, extractCompanyFromDoc, extractAddressFromDoc
// are provided by utils.js (loaded first via manifest.json)

// Extract all unique job detail links from a parsed document
function extractJobLinksFromDoc(doc) {
  const links = new Set();
  doc.querySelectorAll("a[href]").forEach((a) => {
    // Use getAttribute to get raw href (avoids chrome-extension:// resolution in DOMParser)
    const href = a.getAttribute("href");
    if (!href) return;

    // Build absolute URL
    let url;
    if (href.startsWith("http")) {
      url = href;
    } else if (href.startsWith("/")) {
      url = "https://www.azubi.de" + href;
    } else {
      return;
    }

    url = url.split("?")[0]; // strip query params

    // Match azubi.de job detail URL patterns — must start with a numeric ID
    if (
      url.match(/azubi\.de\/ausbildungsplatz\/\d+[\w\-]+$/) ||
      url.match(/azubi\.de\/berufsausbildung\/\d+[\w\-]+$/) ||
      url.match(/azubi\.de\/stelle\/\d+[\w\-]+$/)
    ) {
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
// azubi.de uses ?page=N in the URL
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
      console.log(`[Azubi] Fetching page ${page}: ${pageUrl}`);
      try {
        const res = await fetch(pageUrl, { credentials: "include" });
        if (!res.ok) {
          console.warn("[Azubi] Page fetch failed:", res.status);
          break;
        }
        const html = await res.text();
        const parser = new DOMParser();
        pageDoc = parser.parseFromString(html, "text/html");
      } catch (err) {
        console.error("[Azubi] Error fetching page:", err);
        break;
      }
    }

    const jobLinks = extractJobLinksFromDoc(pageDoc).filter(
      (l) => !processedLinks.has(l),
    );
    console.log(`[Azubi] Page ${page}: found ${jobLinks.length} new job links`);

    if (jobLinks.length === 0) {
      emptyPageCount++;
      if (emptyPageCount >= MAX_EMPTY_PAGES) {
        console.log(
          "[Azubi] No more results after",
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
          console.warn("[Azubi] Fetch failed:", jobUrl, response.status);
          continue;
        }

        const html = await response.text();

        const email = extractEmailFromHtml(html);
        if (!email) {
          console.log("[Azubi] No email, skipping:", jobUrl);
          continue; // email is required
        }

        const phone = extractPhoneFromHtml(html);

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const company = extractCompanyFromDoc(doc);
        const address = extractAddressFromDoc(doc);

        // Email dedup: skip if this email was already scraped
        const isDuplicate = currentData.some(d => d.email === email);
        if (isDuplicate) {
          console.log("[Azubi] Duplicate email, skipping:", email);
          continue;
        }

        currentData.push({
          company,
          email,
          address,
          contact: "",
          anrede: "",
          link: jobUrl,
          phone,
        });

        await new Promise((r) =>
          chrome.storage.local.set({ scrapedData: currentData }, r),
        );
        chrome.runtime.sendMessage({
          action: "progress",
          count: currentData.length,
          currentTitle: company,
        });
        console.log(`[Azubi] Extracted (${currentData.length}/${limit}):`, {
          company,
          email,
          address,
          phone,
        });
      } catch (err) {
        console.error("[Azubi] Error fetching:", jobUrl, err);
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
    console.error('[Azubi] Scraping error:', err);
    isScraping = false;
    isPaused = false;
    chrome.storage.local.set({ isScraping: false, isPaused: false });
    chrome.runtime.sendMessage({ action: 'error', message: String(err) });
  }
};

// Count available results on the current page
async function countResults() {
  await sleep(800);

  const selectors = [
    '[class*="result-count"]',
    '[class*="resultCount"]',
    '[class*="headline"]',
    "h1",
    "h2",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = el.innerText || el.textContent || "";
    const match = text.match(
      /([\d.,]+)\s*(Ausbildung|Stellen|Ergebnisse|results|freie|Jobs|Angebote)/i,
    );
    if (match) return parseInt(match[1].replace(/[.,]/g, ""), 10);
    const numMatch = text.match(/^([\d.,]+)/);
    if (numMatch) return parseInt(numMatch[1].replace(/[.,]/g, ""), 10);
  }

  return getJobLinksFromPage().length;
}

// Listen for popup messages
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
