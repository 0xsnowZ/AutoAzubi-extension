/**
 * popup_history.js — Scraping history management for AutoAzubi popup
 * Loaded before popup.js. Exposes: window.PopupHistory
 */
window.PopupHistory = {
  /**
   * Save a completed scraping session to history.
   * @param {number} count - Number of leads found
   * @param {string} portalName - Name of the portal scraped
   */
  save(count, portalName) {
    chrome.storage.local.get(
      ["scrapingHistory", "scrapeStartTime"],
      (result) => {
        const history = result.scrapingHistory || [];
        const startTime = result.scrapeStartTime || Date.now();
        const durationMs = Date.now() - startTime;
        history.unshift({
          id: Date.now().toString(36),
          portal: portalName || "Unknown",
          date: new Date().toISOString(),
          leadsFound: count,
          durationMs,
        });
        // Keep only last 20 sessions
        if (history.length > 20) history.length = 20;
        chrome.storage.local.set({ scrapingHistory: history });
      },
    );
  },

  /**
   * Render the history timeline into the given container.
   * @param {HTMLElement} listEl - Container element for history cards
   * @param {HTMLElement} emptyEl - "No history" placeholder element
   */
  render(listEl, emptyEl) {
    if (!listEl || !emptyEl) return;
    chrome.storage.local.get(["scrapingHistory"], (result) => {
      const history = result.scrapingHistory || [];
      if (history.length === 0) {
        emptyEl.classList.remove("hidden");
        listEl
          .querySelectorAll(".history-card")
          .forEach((c) => c.remove());
        return;
      }
      emptyEl.classList.add("hidden");
      // Remove old cards, keep the empty message element
      listEl
        .querySelectorAll(".history-card")
        .forEach((c) => c.remove());

      history.forEach((s) => {
        const date = new Date(s.date);
        const dateStr = date.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        const timeStr = date.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dur = PopupHistory.formatDuration(s.durationMs || 0);
        const speed =
          s.durationMs > 6000
            ? (s.leadsFound / (s.durationMs / 60000)).toFixed(1) + "/min"
            : "\u2014";

        const card = document.createElement("div");
        card.className = "history-card";

        const dot = document.createElement("div");
        dot.className = "timeline-dot";

        const body = document.createElement("div");
        body.className = "timeline-body";

        const top = document.createElement("div");
        top.className = "timeline-top";
        const badge = document.createElement("span");
        badge.className = "history-portal-badge";
        badge.textContent = s.portal || "Unknown";
        const leadsSpan = document.createElement("span");
        leadsSpan.className = "history-leads-count";
        leadsSpan.textContent = s.leadsFound + " ";
        const unitSpan = document.createElement("span");
        unitSpan.className = "history-leads-unit";
        unitSpan.textContent = "leads";
        leadsSpan.appendChild(unitSpan);
        top.append(badge, leadsSpan);

        const meta = document.createElement("div");
        meta.className = "timeline-meta";
        const timeSpan = document.createElement("span");
        timeSpan.textContent = timeStr + " \u00B7 " + dateStr;
        const pills = document.createElement("span");
        pills.className = "timeline-pills";
        const speedPill = document.createElement("span");
        speedPill.className = "timeline-pill";
        speedPill.textContent = speed;
        const durPill = document.createElement("span");
        durPill.className = "timeline-pill";
        durPill.textContent = dur;
        pills.append(speedPill, durPill);
        meta.append(timeSpan, pills);

        body.append(top, meta);
        card.append(dot, body);
        listEl.appendChild(card);
      });
    });
  },

  /**
   * Format a duration in ms to a human-readable string (e.g. "3m 42s").
   * @param {number} ms - Duration in milliseconds
   * @returns {string}
   */
  formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec}s`;
  },
};
