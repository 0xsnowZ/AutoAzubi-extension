/**
 * popup_history.js — Scraping history & Lifetime Dashboard management for AutoAzubi popup
 * Loaded before popup.js. Exposes: window.PopupHistory
 */
window.PopupHistory = {
  // Theme-harmonized palette for portal distribution
  _portalColors: {
    "Arbeitsagentur": "#6366f1",
    "Ausbildung.de": "#3b82f6",
    "Aubi-Plus.de": "#10b981",
    "Azubi.de": "#f59e0b",
    "Google Maps": "#ec4899",
    "DasÖrtliche": "#ec4899",
    "Unknown": "#8b5cf6",
  },

  /**
   * Save a completed scraping session to history and update lifetime statistics.
   * @param {number} count - Number of leads found
   * @param {string} portalName - Name of the portal scraped
   * @param {number} [totalChecked] - Optional total listings checked during session
   */
  save(count, portalName, totalChecked) {
    const portal = portalName || "Unknown";
    const evaluated = typeof totalChecked === "number" && totalChecked >= count ? totalChecked : count;

    chrome.storage.local.get(
      ["scrapingHistory", "lifetimeStats", "scrapeStartTime"],
      (result) => {
        const history = result.scrapingHistory || [];
        const startTime = result.scrapeStartTime || Date.now();
        const durationMs = Date.now() - startTime;

        // 1. Retrieve or migrate baseline stats before adding new session
        const stats = this._getOrMigrateStats(result, history);
        stats.totalLeads = (stats.totalLeads || 0) + count;
        stats.totalChecked = (stats.totalChecked || 0) + evaluated;
        stats.sessionsCount = (stats.sessionsCount || 0) + 1;

        if (!stats.portalStats) stats.portalStats = {};
        if (!stats.portalStats[portal]) {
          stats.portalStats[portal] = { leads: 0, checked: 0 };
        }
        stats.portalStats[portal].leads += count;
        stats.portalStats[portal].checked += evaluated;

        // 2. Update Session History (last 20)
        history.unshift({
          id: Date.now().toString(36),
          portal,
          date: new Date().toISOString(),
          leadsFound: count,
          totalChecked: evaluated,
          durationMs,
        });
        if (history.length > 20) history.length = 20;

        chrome.storage.local.set({
          scrapingHistory: history,
          lifetimeStats: stats,
        });
      },
    );
  },

  /**
   * Internal: Retrieve or migrate initial lifetime statistics from past history.
   * Ensures existing users immediately see accurate baseline stats.
   * @private
   */
  _getOrMigrateStats(storageResult, historyList) {
    if (storageResult && storageResult.lifetimeStats && typeof storageResult.lifetimeStats.totalLeads === "number") {
      return storageResult.lifetimeStats;
    }

    // Auto-migrate from history array if lifetimeStats was never initialized
    const stats = {
      totalLeads: 0,
      totalChecked: 0,
      sessionsCount: 0,
      portalStats: {},
    };

    const history = historyList || storageResult.scrapingHistory || [];
    history.forEach((s) => {
      const p = s.portal || "Unknown";
      const leads = s.leadsFound || 0;
      const checked = s.totalChecked || leads;

      stats.totalLeads += leads;
      stats.totalChecked += checked;
      stats.sessionsCount += 1;

      if (!stats.portalStats[p]) {
        stats.portalStats[p] = { leads: 0, checked: 0 };
      }
      stats.portalStats[p].leads += leads;
      stats.portalStats[p].checked += checked;
    });

    return stats;
  },

  /**
   * Render the Lifetime Dashboard and History Timeline into the given container.
   * @param {HTMLElement} listEl - Container element for history cards
   * @param {HTMLElement} emptyEl - "No history" placeholder element
   */
  render(listEl, emptyEl, currentLang) {
    if (!listEl || !emptyEl) return;

    chrome.storage.local.get(
      ["scrapingHistory", "lifetimeStats", "scrapedData", "uiLang"],
      (result) => {
        const browserCode = (typeof navigator !== "undefined" && navigator.language && navigator.language.slice(0, 2).toLowerCase()) || "en";
        const lang = currentLang || result.uiLang || (["de", "fr", "ar", "en"].includes(browserCode) ? browserCode : "en");
        const localeMap = { de: "de-DE", fr: "fr-FR", ar: "ar-SA", en: "en-US" };
        const activeLocale = localeMap[lang] || "en-US";

        const history = result.scrapingHistory || [];
        const stats = this._getOrMigrateStats(result, history);

        // ── 1. Render Lifetime Dashboard ──────────────────────────────────────
        this._renderLifetimeDashboard(stats, history);

        // ── 2. Render Timeline Sessions ───────────────────────────────────────
        if (history.length === 0) {
          emptyEl.classList.remove("hidden");
          listEl.querySelectorAll(".history-card").forEach((c) => c.remove());
          return;
        }

        emptyEl.classList.add("hidden");
        listEl.querySelectorAll(".history-card").forEach((c) => c.remove());

        history.forEach((s) => {
          const date = new Date(s.date);
          const dateStr = date.toLocaleDateString(activeLocale, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const timeStr = date.toLocaleTimeString(activeLocale, {
            hour: "2-digit",
            minute: "2-digit",
          });
          const dur = this.formatDuration(s.durationMs || 0);
          const speed =
            s.durationMs > 6000
              ? (s.leadsFound / (s.durationMs / 60000)).toFixed(1) + "/min"
              : "\u2014";

          const card = document.createElement("div");
          card.className = "history-card";

          const dot = document.createElement("div");
          dot.className = "timeline-dot";
          const pColor = this._portalColors[s.portal] || this._portalColors.Unknown;
          dot.style.background = pColor;

          const body = document.createElement("div");
          body.className = "timeline-body";

          const top = document.createElement("div");
          top.className = "timeline-top";
          const badge = document.createElement("span");
          badge.className = "history-portal-badge";
          badge.textContent = s.portal || "Unknown";
          badge.style.color = pColor;
          badge.style.background = `${pColor}18`;

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
          timeSpan.textContent = `${timeStr} \u00B7 ${dateStr}`;
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
      },
    );
  },

  /**
   * Internal: Render Lifetime Overview 3-metric row and segmented portal distribution bar.
   * @private
   */
  _renderLifetimeDashboard(stats, history) {
    const totalLeadsEl = document.getElementById("lifetime-total-leads");
    const discoveryRateEl = document.getElementById("lifetime-discovery-rate");
    const totalSessionsEl = document.getElementById("lifetime-total-sessions");
    const sessionsBadgeEl = document.getElementById("lifetime-sessions-badge");
    const portalDistSummaryEl = document.getElementById("portal-dist-summary");
    const portalDistBarEl = document.getElementById("portal-dist-bar");
    const portalDistLegendEl = document.getElementById("portal-dist-legend");

    const totalLeads = stats.totalLeads || 0;
    const totalChecked = stats.totalChecked || totalLeads;
    const totalSessions = stats.sessionsCount || (history ? history.length : 0);

    // 1. Total Leads
    if (totalLeadsEl) totalLeadsEl.textContent = totalLeads.toLocaleString();

    // 2. Average Email Discovery Rate
    if (discoveryRateEl) {
      if (totalChecked > 0 && totalLeads > 0) {
        const rate = Math.min(100, Math.round((totalLeads / totalChecked) * 100));
        discoveryRateEl.textContent = `${rate}%`;
      } else if (totalLeads > 0) {
        discoveryRateEl.textContent = "100%";
      } else {
        discoveryRateEl.textContent = "\u2014";
      }
    }

    // 3. Total Sessions
    if (totalSessionsEl) totalSessionsEl.textContent = String(totalSessions);
    if (sessionsBadgeEl) {
      sessionsBadgeEl.textContent = `${totalSessions} ${totalSessions === 1 ? "session" : "sessions"}`;
    }

    // 4. Portal Distribution Breakdown
    const portalMap = stats.portalStats || {};
    const portalEntries = Object.entries(portalMap).filter(([_, data]) => data.leads > 0);

    if (portalDistSummaryEl) {
      portalDistSummaryEl.textContent = `${portalEntries.length} ${portalEntries.length === 1 ? "portal" : "portals"}`;
    }

    if (portalDistBarEl) {
      portalDistBarEl.innerHTML = "";
      if (totalLeads === 0 || portalEntries.length === 0) {
        const emptySeg = document.createElement("div");
        emptySeg.className = "portal-dist-segment portal-dist-segment--empty";
        emptySeg.style.width = "100%";
        portalDistBarEl.appendChild(emptySeg);
      } else {
        // Sort portals by descending leads count
        portalEntries.sort((a, b) => b[1].leads - a[1].leads);

        portalEntries.forEach(([portal, data]) => {
          const pct = Math.max(1, ((data.leads / totalLeads) * 100).toFixed(1));
          const seg = document.createElement("div");
          seg.className = "portal-dist-segment";
          seg.style.width = `${pct}%`;
          const color = this._portalColors[portal] || this._portalColors.Unknown;
          seg.style.backgroundColor = color;
          seg.title = `${portal}: ${data.leads} leads (${pct}%)`;
          portalDistBarEl.appendChild(seg);
        });
      }
    }

    if (portalDistLegendEl) {
      portalDistLegendEl.innerHTML = "";
      if (totalLeads === 0 || portalEntries.length === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "portal-dist-empty";
        emptyMsg.textContent = "No distribution data yet";
        portalDistLegendEl.appendChild(emptyMsg);
      } else {
        portalEntries.forEach(([portal, data]) => {
          const pct = Math.round((data.leads / totalLeads) * 100);
          const color = this._portalColors[portal] || this._portalColors.Unknown;

          const item = document.createElement("div");
          item.className = "portal-legend-item";

          const dot = document.createElement("span");
          dot.className = "portal-legend-dot";
          dot.style.backgroundColor = color;

          const name = document.createElement("span");
          name.className = "portal-legend-name";
          name.textContent = portal;

          const count = document.createElement("span");
          count.className = "portal-legend-count";
          count.textContent = data.leads.toLocaleString();

          const pill = document.createElement("span");
          pill.className = "portal-legend-pct";
          pill.textContent = `${pct}%`;
          pill.style.color = color;
          pill.style.backgroundColor = `${color}15`;

          item.append(dot, name, count, pill);
          portalDistLegendEl.appendChild(item);
        });
      }
    }
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
