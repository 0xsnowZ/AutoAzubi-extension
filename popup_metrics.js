/**
 * popup_metrics.js — ETA timer & scraping metrics for AutoAzubi popup
 * Loaded before popup.js. Exposes: window.PopupMetrics
 */
window.PopupMetrics = {
  // Internal state
  _etaInterval: null,
  _scrapeStartTime: null,
  _lastKnownCount: 0,

  // DOM element references (set via init)
  _elapsedTimeEl: null,
  _scrapeSpeedEl: null,
  _etaTimeEl: null,
  _limitInput: null,

  /**
   * Initialize with DOM element references.
   * @param {Object} elements
   * @param {HTMLElement} elements.elapsedTime - Elapsed time display
   * @param {HTMLElement} elements.scrapeSpeed - Speed display
   * @param {HTMLElement} elements.etaTime - ETA display
   * @param {HTMLInputElement} elements.limitInput - Extraction limit input
   */
  init({ elapsedTime, scrapeSpeed, etaTime, limitInput }) {
    this._elapsedTimeEl = elapsedTime;
    this._scrapeSpeedEl = scrapeSpeed;
    this._etaTimeEl = etaTime;
    this._limitInput = limitInput;
  },

  /** Start the elapsed-time timer. Reads scrapeStartTime from storage. */
  startEtaTimer() {
    chrome.storage.local.get(["scrapeStartTime"], (result) => {
      this._scrapeStartTime = result.scrapeStartTime || Date.now();
      if (!result.scrapeStartTime) {
        chrome.storage.local.set({ scrapeStartTime: this._scrapeStartTime });
      }
      this.stopEtaTimer();
      this._etaInterval = setInterval(() => this._tickElapsed(), 1000);
      this._tickElapsed();
    });
  },

  /** Stop the elapsed-time timer. */
  stopEtaTimer() {
    if (this._etaInterval) {
      clearInterval(this._etaInterval);
      this._etaInterval = null;
    }
  },

  /** Reset all metric displays and clear persisted values. */
  resetDisplay() {
    if (this._elapsedTimeEl) this._elapsedTimeEl.textContent = "0:00";
    if (this._scrapeSpeedEl) this._scrapeSpeedEl.textContent = "\u2014";
    if (this._etaTimeEl) this._etaTimeEl.textContent = "\u2014";
    this._scrapeStartTime = null;
    this._lastKnownCount = 0;
    chrome.storage.local.remove([
      "scrapeStartTime",
      "finalElapsed",
      "finalSpeed",
    ]);
  },

  /** Internal: update the elapsed-time display each tick. */
  _tickElapsed() {
    if (!this._scrapeStartTime || !this._elapsedTimeEl) return;
    const elapsed = Math.floor(
      (Date.now() - this._scrapeStartTime) / 1000,
    );
    this._elapsedTimeEl.textContent = this._formatTimer(elapsed);
  },

  /**
   * Update speed and ETA metrics based on current count.
   * @param {number} count - Current number of scraped leads
   */
  updateMetrics(count) {
    if (!this._scrapeStartTime) return;
    this._lastKnownCount = count;
    const elapsedSec = (Date.now() - this._scrapeStartTime) / 1000;
    const elapsedMin = elapsedSec / 60;

    // Speed
    if (this._scrapeSpeedEl && elapsedMin > 0.1) {
      const speed = count / elapsedMin;
      this._scrapeSpeedEl.textContent = speed.toFixed(1) + "/min";
    }

    // ETA
    const target = parseInt(this._limitInput?.value) || 50;
    if (this._etaTimeEl && count > 0 && count < target) {
      const rate = count / elapsedSec;
      const remaining = (target - count) / rate;
      this._etaTimeEl.textContent =
        "~" + this._formatTimer(Math.ceil(remaining));
    } else if (this._etaTimeEl && count >= target) {
      this._etaTimeEl.textContent = "Done";
    }
  },

  /**
   * Save final metrics to storage when scraping finishes.
   * Also updates the display immediately.
   * @param {number} count - Final number of scraped leads
   */
  saveFinalMetrics(count) {
    if (!this._scrapeStartTime) return;
    const elapsedSec = (Date.now() - this._scrapeStartTime) / 1000;
    const elapsedMin = elapsedSec / 60;
    const finalElapsed = this._formatTimer(Math.floor(elapsedSec));
    const finalSpeed =
      elapsedMin > 0.1
        ? (count / elapsedMin).toFixed(1) + "/min"
        : "\u2014";

    // Persist so popup reopen shows correct values
    chrome.storage.local.set({ finalElapsed, finalSpeed });

    // Update UI immediately
    if (this._elapsedTimeEl) this._elapsedTimeEl.textContent = finalElapsed;
    if (this._scrapeSpeedEl) this._scrapeSpeedEl.textContent = finalSpeed;
    if (this._etaTimeEl) this._etaTimeEl.textContent = "Done";
  },

  /**
   * Restore saved metrics when popup reopens in 'finished' state.
   * @param {HTMLElement} metricsRow - The metrics row element
   * @param {Object} storageResult - Object with finalElapsed and finalSpeed keys
   */
  restoreFinished(metricsRow, storageResult) {
    if (!metricsRow) return;
    const elapsed = storageResult.finalElapsed;
    const speed = storageResult.finalSpeed;
    if (elapsed || speed) {
      metricsRow.classList.remove("hidden");
      if (this._elapsedTimeEl)
        this._elapsedTimeEl.textContent = elapsed || "\u2014";
      if (this._scrapeSpeedEl)
        this._scrapeSpeedEl.textContent = speed || "\u2014";
      if (this._etaTimeEl) this._etaTimeEl.textContent = "Done";
    } else {
      metricsRow.classList.add("hidden");
    }
  },

  /**
   * Format seconds into "M:SS" display string.
   * @param {number} totalSec
   * @returns {string}
   */
  _formatTimer(totalSec) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  },
};
