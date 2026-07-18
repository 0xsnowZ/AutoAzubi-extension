/**
 * Background Service Worker
 * Handles fetch proxy for cross-origin requests
 */

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch_text") {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    // DasÖrtliche uses ISO-8859-1 encoding
    fetch(request.url, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        return res.arrayBuffer().then((buffer) => {
          const decoder = new TextDecoder("iso-8859-1");
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
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");
});
