/**
 * Background Service Worker
 * Handles fetch proxy for cross-origin requests
 */

// Allowed domains for fetch proxy — prevents misuse as an open proxy
const ALLOWED_DOMAINS = [
  "dasoertliche.de",
  "gelbeseiten.de",
  "arbeitsagentur.de",
  "ausbildung.de",
  "aubi-plus.de",
  "azubi.de",
];

function isUrlAllowed(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith("." + d),
    );
  } catch {
    return false;
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch_text") {
    if (!isUrlAllowed(request.url)) {
      sendResponse({ success: false, error: "URL not in allowed domains" });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    // Auto-detect encoding from Content-Type header, fallback to UTF-8
    fetch(request.url, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        const contentType = res.headers.get('content-type') || '';
        const charsetMatch = contentType.match(/charset=([\w-]+)/i);
        const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
        return res.arrayBuffer().then((buffer) => {
          const decoder = new TextDecoder(charset);
          return decoder.decode(buffer);
        });
      })
      .then((text) => sendResponse({ success: true, text: text }))
      .catch((err) => {
        clearTimeout(timeoutId);
        sendResponse({ success: false, error: err.toString() });
      });
    return true; // async response
  }

  if (request.action === "fetch_text_utf8") {
    // For crawlWebsiteForEmail, allow any URL since we're following links from known sites
    // But still validate it's a proper HTTP(S) URL
    try {
      const parsed = new URL(request.url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        sendResponse({ success: false, error: "Invalid protocol" });
        return;
      }
    } catch {
      sendResponse({ success: false, error: "Invalid URL" });
      return;
    }

    // UTF-8 fetch for external websites (Impressum, Kontakt pages, etc.)
    // 3-second timeout to avoid blocking on slow/unresponsive sites
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    fetch(request.url, {
      signal: controller.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
      },
    })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => sendResponse({ success: true, text: text }))
      .catch((err) => {
        clearTimeout(timeoutId);
        sendResponse({ success: false, error: err.toString() });
      });
    return true; // async response
  }

  // ── Extension Icon Badge ──────────────────────────────────────────────────
  if (request.action === "progress" && request.count !== undefined) {
    const text = request.count > 0 ? String(request.count) : "";
    chrome.action.setBadgeText({ text });
    return;
  }

  if (request.action === "finished" || request.action === "stopped") {
    // Keep the final count visible for 5 seconds, then clear
    if (request.count) {
      chrome.action.setBadgeText({ text: String(request.count) });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
    return;
  }

  if (request.action === "badgeClear") {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  chrome.action.setBadgeText({ text: "" });
});
