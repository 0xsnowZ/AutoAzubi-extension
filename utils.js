/**
 * utils.js — Shared utility module for AutoAzubi content scripts
 * Loaded before site-specific scripts via manifest.json content_scripts.
 * All functions are available as globals in the content script scope.
 */

// ─── Sleep ───────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Email Extraction (9 strategies, most reliable → broadest) ───────────────────

function extractEmailFromHtml(rawHtml) {
  if (!rawHtml) return "";

  let email = "";

  // Strategy 1: href="mailto:..." on .mail anchor (DasÖrtliche-specific, but harmless elsewhere)
  const mailtoHref =
    rawHtml.match(/class="mail"[^>]*href="mailto:([^"?\s]+)"/i) ||
    rawHtml.match(/href="mailto:([^"?\s]+)"[^>]*class="mail"/i);
  if (mailtoHref) {
    email = mailtoHref[1].trim();
  }

  // Strategy 2: title="..." on .mail anchor
  if (!email) {
    const titleMatch =
      rawHtml.match(/class="mail"[^>]*title="([^"]+@[^"]+)"/i) ||
      rawHtml.match(/title="([^"]+@[^"]+)"[^>]*class="mail"/i);
    if (titleMatch) email = titleMatch[1].trim();
  }

  // Strategy 3: Generic mailto: anywhere
  if (!email) {
    const genericMailto = rawHtml.match(/href="mailto:([^"?\s]+)"/i);
    if (genericMailto) email = genericMailto[1].trim();
  }

  // Strategy 4: data-email / data-mail attribute (common obfuscation)
  if (!email) {
    const dataEmail =
      rawHtml.match(/data-email="([^"]+)"/i) ||
      rawHtml.match(/data-mail="([^"]+)"/i);
    if (dataEmail) {
      email = dataEmail[1].trim();
      // Aubi-Plus obfuscation: "l###i###a###@###e###x###.###d###e"
      email = email.replace(/###/g, "");
      email = email
        .replace(/\(at\)/gi, "@")
        .replace(/\[at\]/gi, "@")
        .replace(/\s*at\s*/gi, "@");
      email = email
        .replace(/\(dot\)/gi, ".")
        .replace(/\[dot\]/gi, ".")
        .replace(/\s*dot\s*/gi, ".");
    }
  }

  // Strategy 5: onclick handlers with mailto
  if (!email) {
    const onclickMailto = rawHtml.match(
      /onclick="[^"]*mailto:([^"'\s?]+)/i,
    );
    if (onclickMailto) email = onclickMailto[1].trim();
  }

  // Strategy 6: HTML entity encoded emails (&#109;&#97;&#105;&#108;&#116;&#111;&#58;)
  if (!email) {
    const entityMatch = rawHtml.match(
      /href="&#109;&#97;&#105;&#108;&#116;&#111;&#58;([^"]+)"/i,
    );
    if (entityMatch) {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = entityMatch[1];
      email = textarea.value.trim();
    }
  }

  // Strategy 7: Obfuscated [at] / [AT] / [dot] / [DOT]
  if (!email) {
    const obfuscatedMatch = rawHtml.match(
      /[\w.\-]+\s*\[(?:at|AT)\]\s*[\w.\-]+\s*\[(?:dot|DOT)\]\s*[\w.\-]+/,
    );
    if (obfuscatedMatch) {
      email = obfuscatedMatch[0]
        .replace(/\s*\[(?:at|AT)\]\s*/g, "@")
        .replace(/\s*\[(?:dot|DOT)\]\s*/g, ".");
    }
  }

  // Strategy 8: (at) / (dot) parentheses
  if (!email) {
    const parenMatch = rawHtml.match(
      /[\w.\-]+\s*\(at\)\s*[\w.\-]+\s*\(dot\)\s*[\w.\-]+/i,
    );
    if (parenMatch) {
      email = parenMatch[0]
        .replace(/\s*\(at\)\s*/gi, "@")
        .replace(/\s*\(dot\)\s*/gi, ".");
    }
  }

  // Strategy 9: Broad email regex on visible text (last resort)
  if (!email) {
    const visibleText = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");
    const emailRegex = visibleText.match(
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
    );
    if (emailRegex) {
      email = emailRegex[0].trim();
      // Filter false positives (image filenames, etc.)
      if (/\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf)$/i.test(email)) {
        email = "";
      }
    }
  }

  // Clean up: decode remaining HTML entities
  if (email && /&#\d+;|&\w+;/.test(email)) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = email;
    email = textarea.value.trim();
  }

  // Final validation
  if (
    email &&
    !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)
  ) {
    email = "";
  }

  return email.toLowerCase();
}

// ─── Company Extraction (JSON-LD → DOM fallback) ─────────────────────────────────

function extractCompanyFromDoc(doc) {
  // Priority 1: JSON-LD structured data
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.hiringOrganization && item.hiringOrganization.name) {
          return item.hiringOrganization.name.trim();
        }
        if (item["@type"] === "Organization" && item.name) {
          return item.name.trim();
        }
      }
    } catch (e) {} // Malformed JSON, skip
  }

  // Priority 2: DOM selectors (broadest set, covers ausbildung.de + azubi.de)
  const selectors = [
    ".jp-c-header__corporation-link",
    '[class*="corporation-link"]',
    '[class*="company-name"]',
    '[class*="companyName"]',
    '[class*="employer-name"]',
    '[class*="employerName"]',
    '[class*="employer"]',
    '[class*="corporation"]',
    '[itemprop="name"]',
    '[class*="hiring-organization"]',
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

// ─── Address Extraction (JSON-LD → DOM fallback) ─────────────────────────────────

function extractAddressFromDoc(doc) {
  // Priority 1: JSON-LD structured data
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        // JobPosting jobLocation
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
              return extra.length
                ? `${street}, ${extra.join(", ")}`
                : street;
            }
            const parts = [postal, city].filter(Boolean);
            if (parts.length) return parts.join(", ");
          }
          // Sometimes address is directly on the Place
          if (loc && loc.name) return loc.name.trim();
        }
        // Direct address field
        if (item.address) {
          const addr = item.address;
          if (typeof addr === "string" && addr.trim()) return addr.trim();
          const parts = [
            addr.streetAddress,
            addr.postalCode,
            addr.addressLocality,
          ].filter(Boolean);
          if (parts.length) return parts.join(", ");
        }
      }
    } catch (e) {}
  }

  // Priority 2: itemprop selectors (schema.org microdata)
  const locality = doc.querySelector('[itemprop="addressLocality"]');
  const postal = doc.querySelector('[itemprop="postalCode"]');
  const street = doc.querySelector('[itemprop="streetAddress"]');
  if (locality || postal || street) {
    return [street, postal, locality]
      .map((el) => (el ? el.textContent.trim() : ""))
      .filter(Boolean)
      .join(", ");
  }

  // Priority 3: Location-specific selectors
  const selectors = [
    ".jp-title__address",
    '[class*="job-location"]',
    '[class*="jobLocation"]',
    '[class*="location-text"]',
    '[class*="locationText"]',
    '[class*="standort"]',
    '[class*="city"]',
    '[class*="ort"]',
    '[data-testid*="location"]',
    '[data-testid*="address"]',
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

// ─── Phone Extraction ────────────────────────────────────────────────────────────

function extractPhoneFromHtml(html) {
  if (!html) return "";
  const telMatch = html.match(/href=["']tel:([^"'?\s]+)/i);
  if (telMatch) return telMatch[1].trim();
  return "";
}

// ─── Smart Element Waiter (MutationObserver) ─────────────────────────────────────

/**
 * Wait for an element to appear in the DOM using MutationObserver.
 * More efficient than polling — returns as soon as the element appears.
 * Supports both CSS selector strings and callback functions.
 *
 * @param {string|Function} selector - CSS selector or function returning an element
 * @param {number} timeoutMs - Max time to wait before returning null (default: 5000ms)
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const check =
      typeof selector === "function"
        ? selector
        : () => document.querySelector(selector);

    const existing = check();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = check();
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

// ─── Fetch with Retry ────────────────────────────────────────────────────────────

/**
 * Wrapper around fetch() with automatic retry and linear backoff.
 * On non-ok responses or network errors, retries up to `retries` times
 * with increasing delay between attempts.
 *
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Standard fetch options
 * @param {number} retries - Number of retry attempts (default: 2)
 * @param {number} baseDelayMs - Base delay in ms, multiplied by attempt number (default: 1000)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retries = 2, baseDelayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || attempt >= retries) return response;
      console.warn(
        `[fetchWithRetry] Attempt ${attempt + 1}/${retries + 1} failed (HTTP ${response.status}): ${url}`,
      );
    } catch (err) {
      if (attempt >= retries) throw err;
      console.warn(
        `[fetchWithRetry] Attempt ${attempt + 1}/${retries + 1} error: ${err.message}`,
      );
    }
    await sleep(baseDelayMs * (attempt + 1));
  }
}

// ─── Shared Message Handler Factory ──────────────────────────────────────────────

/**
 * Creates a chrome.runtime.onMessage listener with common scraper actions built in.
 * Scripts provide custom handlers via `callbacks` and the factory handles boilerplate
 * for pause, resume, stop, getInitialInfo, and getData.
 *
 * All handlers automatically return true (async-safe).
 *
 * @param {Function} getState - Returns { isScraping, isPaused } from the script's scope
 * @param {Object} callbacks - Action handlers and lifecycle hooks:
 *   Custom action handlers (override defaults):
 *     - start(request, sendResponse)
 *     - reset(request, sendResponse)
 *     - countResults(request, sendResponse)
 *     - getData(request, sendResponse)
 *     - getInitialInfo(request, sendResponse)
 *   Lifecycle hooks (called by default handlers):
 *     - onSettings(settings) — called when settings message arrives
 *     - onPause()            — called on 'pause' action
 *     - onResume()           — called on 'resume' action
 *     - onStop()             — called on 'stop' action
 * @returns {Function} Listener for chrome.runtime.onMessage.addListener
 */
function createScraperMessageHandler(getState, callbacks) {
  return (request, sender, sendResponse) => {
    // Settings propagation
    if (request.settings && callbacks.onSettings) {
      callbacks.onSettings(request.settings);
    }

    const action = request.action;
    if (!action) return;

    // Custom handlers take full priority
    if (callbacks[action]) {
      callbacks[action](request, sendResponse);
      return true;
    }

    // Default handlers for common actions
    switch (action) {
      case "pause":
        if (callbacks.onPause) callbacks.onPause();
        sendResponse({ status: "paused" });
        return true;

      case "resume":
        if (callbacks.onResume) callbacks.onResume();
        sendResponse({ status: "resumed" });
        return true;

      case "stop":
        if (callbacks.onStop) callbacks.onStop();
        sendResponse({ status: "stopped" });
        return true;

      case "getInitialInfo":
        chrome.storage.local.get(["scrapedData"], (res) => {
          const state = getState();
          sendResponse({
            isScraping: state.isScraping,
            isPaused: state.isPaused,
            scrapedCount: res.scrapedData ? res.scrapedData.length : 0,
          });
        });
        return true;

      case "getData":
        chrome.storage.local.get(["scrapedData"], (res) => {
          sendResponse({ data: res.scrapedData || [] });
        });
        return true;
    }
  };
}
