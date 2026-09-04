// ausbildung_script.js - Scraper for ausbildung.de (Next.js SPA)
// PAGINATION STRATEGY: Full-page reload with persistent session state.
// Next.js client-side navigation cannot be reliably triggered from a content script.
// We save all state to chrome.storage.local, navigate via window.location.href,
// and auto-resume when this script re-runs on the new page.
// NOTE (B5): This adds ~3-4s overhead per page (re-injection + hydration wait).
// fetch()-based pagination was tested but Next.js returns a shell without rendered
// job cards, so full reload is required for this portal.

let isScraping = false;
let isPaused = false;
let targetLimit = 50;

const PORTAL_SOURCE = 'Ausbildung.de';

const finishedSound = new Audio(chrome.runtime.getURL("finished.mp3"));
let settings = { notifyFinish: true, autoExport: false };
chrome.storage.local.get(["notifyFinish", "autoExport"], (res) => {
  if (res.notifyFinish !== undefined) settings.notifyFinish = res.notifyFinish !== false;
  if (res.autoExport !== undefined) settings.autoExport = res.autoExport === true;
});

// sleep, extractEmailFromHtml, extractCompanyFromDoc, extractAddressFromDoc
// are provided by utils.js (loaded first via manifest.json)

// ─── Data Extraction Helpers ─────────────────────────────────────────────────

function extractJobLinksFromDoc(doc) {
  const links = new Set();
  doc.querySelectorAll('a[href*="/stellen/"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    let url = href.startsWith("http")
      ? href
      : "https://www.ausbildung.de" + href;
    url = url.split("?")[0]; // strip tracking query params
    // Ensure it's a specific job listing, not the directory root
    if (url.includes("/stellen/") && !url.endsWith("/stellen/")) {
      links.add(url);
    }
  });
  return Array.from(links);
}

// ─── Persistent Session Helpers ───────────────────────────────────────────────

const STATE_KEY = "ausbildungScrapingSession";

async function saveSession(session) {
  return new Promise((r) => chrome.storage.local.set({ [STATE_KEY]: session }, r));
}

async function loadSession() {
  return new Promise((r) =>
    chrome.storage.local.get([STATE_KEY], (res) => r(res[STATE_KEY] || null)),
  );
}

async function clearSession() {
  return new Promise((r) => chrome.storage.local.remove(STATE_KEY, r));
}

// ─── URL Builder ─────────────────────────────────────────────────────────────

function buildPageUrl(baseUrl, page) {
  const url = new URL(baseUrl);
  if (page > 1) {
    url.searchParams.set("page", page);
  } else {
    url.searchParams.delete("page");
  }
  return url.toString();
}

// ─── Core Scraping Engine ─────────────────────────────────────────────────────

async function runScraping(session) {
  // BUG FIX: Destructure immutable values and mutable state correctly.
  // `currentData` and `page` need to be `let` for mutation.
  // `processedLinks` is rebuilt from the array each resume to avoid stale Set.
  const { baseUrl } = session;
  targetLimit = session.limit; // Sync module-level limit from session
  let { currentData, page, processedHits: savedHits, dryPageCount: savedDryPages } = session;
  const processedLinks = new Set(session.processedLinks || []);
  let processedHits = savedHits || 0; // Persist across page reloads
  let emptyPageCount = 0;      // Pages with zero job links
  let dryPageCount = savedDryPages || 0;        // Pages with links but zero new emails found
  const MAX_EMPTY_PAGES = 3;
  const MAX_DRY_PAGES = 5;     // Stop if 5 consecutive pages yield no emails

  while (isScraping && currentData.filter(d => d.source === PORTAL_SOURCE).length < targetLimit) {
    // ── Pause loop ──────────────────────────────────────────────────────────
    while (isPaused) {
      await sleep(500);
      if (!isScraping) return; // Stopped while paused
    }
    if (!isScraping) return;

    // ── Get job links from LIVE fully-rendered DOM ──────────────────────────
    const jobLinks = extractJobLinksFromDoc(document).filter(
      (l) => !processedLinks.has(l),
    );

    console.log(`[Ausbildung] Page ${page}: ${jobLinks.length} new links found`);

    if (jobLinks.length === 0) {
      emptyPageCount++;
      if (emptyPageCount >= MAX_EMPTY_PAGES) {
        console.log("[Ausbildung] No more results. Scraping complete.");
        break;
      }
      // Navigate to next page
      await navigateToNextPage(page + 1, baseUrl, currentData, targetLimit, processedLinks, processedHits, dryPageCount);
      return; // Script resumes after page reload
    }

    emptyPageCount = 0;

    // Track emails found on THIS specific page to detect dry pages
    const countBefore = currentData.length;
    for (const jobUrl of jobLinks) {
      // BUG FIX: Only return (not break) when paused to ensure the outer
      // while-loop's pause-check is re-entered properly on resume.
      // When paused mid-loop, we still want to save state, so don't return immediately.
      if (!isScraping) return;
      if (isPaused) {
        // Save current progress before entering pause wait
        await saveSession({ limit: targetLimit, baseUrl, currentData, page, processedLinks: [...processedLinks], processedHits, dryPageCount });
        while (isPaused) {
          await sleep(500);
          if (!isScraping) return;
        }
      }
      if (currentData.filter(d => d.source === PORTAL_SOURCE).length >= targetLimit) break;

      processedLinks.add(jobUrl);
      processedHits++;

      chrome.runtime.sendMessage({
        action: "progress",
        count: currentData.length,
        portalCount: currentData.filter(d => d.source === PORTAL_SOURCE).length,
        currentTitle: `Job ${processedHits} · Page ${page}`,
      });

      try {
        const response = await fetchWithRetry(jobUrl, {
          credentials: "include",
          headers: { "Accept": "text/html,application/xhtml+xml" },
        });
        if (!response.ok) {
          console.warn(`[Ausbildung] Fetch failed (${response.status}): ${jobUrl}`);
          continue;
        }

        const html = await response.text();
        const email = extractEmailFromHtml(html);
        if (!email) continue;

        // Strict deduplication by normalized email
        const isDuplicate = currentData.some(
          (item) => item.email.toLowerCase() === email.toLowerCase(),
        );
        if (isDuplicate) {
          console.log(`[Ausbildung] Skipping duplicate: ${email}`);
          continue;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        let company = extractCompanyFromDoc(doc);

        // Fallback: use job title as company name when company can't be found
        if (!company) {
          const titleEl = doc.querySelector('h1') || doc.querySelector('title');
          if (titleEl) {
            let title = titleEl.textContent.trim();
            title = title.replace(/\s*[|–—-]\s*(ausbildung\.de|ausbildung).*$/i, '').trim();
            if (title && title.length < 120) company = title;
          }
        }

        const address = extractAddressFromDoc(doc);
        const phone = extractPhoneFromHtml(html);

        currentData.push({ company: company || "Unknown", email, address, contact: "", link: jobUrl, phone, source: PORTAL_SOURCE, extractedAt: new Date().toISOString() });

        // Persist to storage immediately so no data is lost on crash/stop
        await new Promise((r) => chrome.storage.local.set({ scrapedData: currentData }, r));
        chrome.runtime.sendMessage({
          action: "progress",
          count: currentData.length,
          portalCount: currentData.filter(d => d.source === PORTAL_SOURCE).length,
          currentTitle: `✓ ${company}`,
        });
        console.log(`[Ausbildung] ✓ (${currentData.length}/${targetLimit}): ${company} <${email}>`);

      } catch (err) {
        console.error(`[Ausbildung] Error processing ${jobUrl}:`, err);
      }

      // Anti-bot jitter: 200–450ms randomized delay
      await sleep(Math.floor(Math.random() * 250) + 200); // Anti-bot jitter
    }

    if (currentData.filter(d => d.source === PORTAL_SOURCE).length >= targetLimit) break;

    // If this page had zero new emails, increment dry page counter
    if (currentData.length === countBefore) {
      dryPageCount++;
      console.log(`[Ausbildung] Dry page ${dryPageCount}/${MAX_DRY_PAGES} (page ${page} had no emails)`);
      if (dryPageCount >= MAX_DRY_PAGES) {
        console.log(`[Ausbildung] Too many dry pages. Finishing with ${currentData.length} results.`);
        chrome.runtime.sendMessage({
          action: "progress",
          count: currentData.length,
          currentTitle: `Done — no more emails found`,
        });
        break;
      }
    } else {
      dryPageCount = 0; // Reset when we find new emails
    }

    // ── All links on this page done, move to next page ──────────────────────
    await navigateToNextPage(page + 1, baseUrl, currentData, targetLimit, processedLinks, processedHits, dryPageCount);
    return; // Script resumes after page reload
  }

  // ── Scraping complete (limit reached or no more pages) ────────────────────
  await clearSession();
  chrome.storage.local.set({ isScraping: false, isPaused: false });

  // BUG FIX: Check `isScraping` BEFORE setting it to false, otherwise
  // the condition is always false when we reach here via a stop() call.
  const wasRunning = isScraping;
  isScraping = false;
  isPaused = false;

  if (wasRunning) {
    if (settings.notifyFinish) finishedSound.play().catch(() => {});
    const portalCount = currentData.filter(d => d.source === PORTAL_SOURCE).length;
    const autoExported = triggerAutoExport(currentData, settings);
    chrome.runtime.sendMessage({ 
      action: "finished", 
      count: currentData.length,
      portalCount,
      totalChecked: processedHits || portalCount,
      early: dryPageCount >= MAX_DRY_PAGES,
      empty: emptyPageCount >= MAX_EMPTY_PAGES,
      autoExported,
    });
  }
}

// Helper: saves session and navigates to the next page
async function navigateToNextPage(nextPage, baseUrl, currentData, limit, processedLinks, processedHits = 0, dryPageCount = 0) {
  const nextUrl = buildPageUrl(baseUrl, nextPage);
  console.log(`[Ausbildung] Navigating to page ${nextPage}: ${nextUrl}`);

  await saveSession({
    limit,
    baseUrl,
    currentData,
    page: nextPage,
    processedLinks: [...processedLinks],
    processedHits,
    dryPageCount
  });

  chrome.runtime.sendMessage({
    action: "progress",
    count: currentData.length,
    currentTitle: `Loading page ${nextPage}...`,
  });

  await sleep(600); // Brief pause to let storage flush before navigation
  window.location.href = nextUrl;
}

// ─── Entry Point: Fresh Start ─────────────────────────────────────────────────

async function handleSearchPage(limit = 50) {
  if (isScraping) return;
  isScraping = true;
  isPaused = false;
  chrome.storage.local.set({ isScraping: true, isPaused: false });

  // Wait for any existing page transition to settle
  await sleep(800);

  const currentData = await new Promise((r) =>
    chrome.storage.local.get(["scrapedData"], (res) => r(res.scrapedData || [])),
  );

  // Strip page param from URL to get the canonical base search URL
  const baseUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    return url.toString();
  })();

  // BUG FIX: If user happens to start on page 2+ (e.g., navigated manually),
  // record the actual current page instead of always assuming page 1.
  const page = parseInt(new URL(window.location.href).searchParams.get("page") || "1", 10);

  const session = { limit, baseUrl, currentData, page, processedLinks: [] };
  await saveSession(session);

  try {
    await runScraping(session);
  } catch (err) {
    console.error("[Ausbildung] Fatal error:", err);
    isScraping = false;
    isPaused = false;
    await clearSession();
    chrome.storage.local.set({ isScraping: false, isPaused: false });
    chrome.runtime.sendMessage({ action: "error", message: String(err) });
  }
}

// ─── Auto-Resume on Page Load ─────────────────────────────────────────────────
// This IIFE runs immediately when the content script is injected (on every page load).
// If a session exists in storage, it means we navigated here mid-scrape and must resume.
(async () => {
  // BUG FIX: Give Next.js enough time to fully hydrate the page and render
  // job card components. 1500ms was too short for slow connections; 2000ms is safer.
  await sleep(2000);

  const session = await loadSession();
  if (!session) return; // No active session, user hasn't started scraping

  console.log(`[Ausbildung] Auto-resuming session on page ${session.page}...`);
  isScraping = true;
  isPaused = false;
  chrome.storage.local.set({ isScraping: true, isPaused: false });

  chrome.runtime.sendMessage({
    action: "progress",
    count: session.currentData.length,
    currentTitle: `Resumed on page ${session.page}`,
  });

  try {
    await runScraping(session);
  } catch (err) {
    console.error("[Ausbildung] Resume error:", err);
    isScraping = false;
    isPaused = false;
    await clearSession();
    chrome.storage.local.set({ isScraping: false, isPaused: false });
  }
})();

// ─── Count Available Results ──────────────────────────────────────────────────
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
    const match = text.match(/([\d.,]+)\s*(freie|Ausbildung|Stellen|Ergebnisse|results)/i);
    if (match) return parseInt(match[1].replace(/[.,]/g, ""), 10);
    const numMatch = text.match(/^([\d.,]+)/);
    if (numMatch) return parseInt(numMatch[1].replace(/[.,]/g, ""), 10);
  }
  return extractJobLinksFromDoc(document).length;
}

// ─── Message Listener ─────────────────────────────────────────────────────────
// Uses shared createScraperMessageHandler from utils.js to reduce boilerplate.
// Default handlers cover: pause, resume, getInitialInfo, getData.
chrome.runtime.onMessage.addListener(
  createScraperMessageHandler(
    () => ({ isScraping, isPaused }),
    {
      onSettings: (s) => { settings = s; },
      onUpdateLimit: (limit) => {
        targetLimit = limit;
        // Also persist to session for page-reload resume
        loadSession().then(session => {
          if (session) { session.limit = limit; saveSession(session); }
        });
      },
      onPause: () => {
        isPaused = true;
        chrome.storage.local.set({ isPaused: true });
      },
      onResume: () => {
        isPaused = false;
        chrome.storage.local.set({ isPaused: false });
      },
      onStop: () => {
        isScraping = false;
        isPaused = false;
        clearSession();
        chrome.storage.local.set({ isScraping: false, isPaused: false });
        // Notify popup of state transition so UI doesn't get stuck on "Extracting"
        chrome.runtime.sendMessage({ action: 'finished', count: 0, portalCount: 0, stopped: true }).catch(() => {});
      },
      start: (request, sendResponse) => {
        const limit = request.limit || 50;
        if (!isScraping) handleSearchPage(limit);
        sendResponse({ status: "started" });
      },
      reset: (request, sendResponse) => {
        isScraping = false;
        isPaused = false;
        clearSession();
        chrome.storage.local.set({ scrapedData: [], isScraping: false, isPaused: false }, () => sendResponse({ status: "reset" }));
      },
      countResults: (request, sendResponse) => {
        countResults().then((total) => sendResponse({ total }));
      },
    }
  )
);
