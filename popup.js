document.addEventListener("DOMContentLoaded", async () => {
  // ── Aliases for extracted modules ──────────────────────────────────────────
  const i18n = window.AutoAzubiI18n;

  // View Elements
  const mainView = document.getElementById("main-view");
  const gmapsView = document.getElementById("gmaps-view");

  // Tabs Elements
  const tabJobs = document.getElementById("tab-jobs");
  const tabGmaps = document.getElementById("tab-gmaps");
  const tabHistory = document.getElementById("tab-history");
  const historyView = document.getElementById("history-view");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const clearHistoryBtn = document.getElementById("clear-history-btn");

  // Setup tabs logic
  tabJobs.addEventListener("click", () => {
    tabJobs.classList.add("active");
    tabGmaps.classList.remove("active");
    if (tabHistory) tabHistory.classList.remove("active");
    mainView.classList.add("active-view");
    gmapsView.classList.remove("active-view");
    if (historyView) historyView.classList.remove("active-view");
  });

  tabGmaps.addEventListener("click", () => {
    tabGmaps.classList.add("active");
    tabJobs.classList.remove("active");
    if (tabHistory) tabHistory.classList.remove("active");
    gmapsView.classList.add("active-view");
    mainView.classList.remove("active-view");
    if (historyView) historyView.classList.remove("active-view");
  });

  if (tabHistory) {
    tabHistory.addEventListener("click", () => {
      tabHistory.classList.add("active");
      tabJobs.classList.remove("active");
      tabGmaps.classList.remove("active");
      historyView.classList.add("active-view");
      mainView.classList.remove("active-view");
      gmapsView.classList.remove("active-view");
      PopupHistory.render(historyList, historyEmpty);
    });
  }

  // Scraper UI Elements
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resumeBtn = document.getElementById("resume-btn");

  const resetBtn = document.getElementById("reset-btn");
  const arbeitsagenturBtn = document.getElementById("arbeitsagentur-btn");
  const ausbildungBtn = document.getElementById("ausbildung-btn");
  const aubiplusBtn = document.getElementById("aubiplus-btn");
  const azubiBtn = document.getElementById("azubi-btn");
  const downloadExcelBtn = document.getElementById("download-excel-btn");
  const statusText = document.getElementById("status-text");
  const countDisplay = document.getElementById("scraped-count");
  const totalDisplay = document.getElementById("total-found");
  const limitInput = document.getElementById("fetch-limit");
  const progressRing = document.getElementById("progress-ring-fill");
  const progressContainer = document.getElementById("progress-container");
  const activityLog = document.getElementById("activity-log");
  const statusCard = document.getElementById("status-card");
  const pulseDot = document.getElementById("pulse-dot");
  const activeSiteBadge = document.getElementById("active-site-badge");

  // Metrics elements (Group 6)
  const metricsRow = document.getElementById("metrics-row");

  // Preview elements (Group 3)
  const previewCount = document.getElementById("preview-count");
  const previewTbody = document.getElementById("preview-tbody");
  const previewEmpty = document.getElementById("preview-empty");
  const previewTableWrap = document.getElementById("preview-table-wrap");

  // Toast container (Group 2)
  const toastContainer = document.getElementById("toast-container");

  // ── Initialize extracted modules ────────────────────────────────────────────
  PopupMetrics.init({
    elapsedTime: document.getElementById("elapsed-time"),
    scrapeSpeed: document.getElementById("scrape-speed"),
    etaTime: document.getElementById("eta-time"),
    limitInput,
  });

  function updateProgress() {
    let current = parseInt(countDisplay.innerText) || 0;
    let target = limitInput.value ? parseInt(limitInput.value) : 1;
    let percent = Math.min((current / target) * 100, 100);

    if (progressRing) {
      const circumference = 364.42; // 2 * pi * 58
      const offset = circumference - (percent / 100) * circumference;
      progressRing.style.strokeDashoffset = offset;
    }
    // Compact the counter font when numbers are long
    const counterBlock = countDisplay.closest(".counter-block");
    if (counterBlock) {
      const totalLen = (totalDisplay.innerText || "").length;
      counterBlock.classList.toggle("compact", totalLen >= 4);
    }
  }

  // Smooth count-up animation
  function animateCount(el, to) {
    const from = parseInt(el.innerText) || 0;
    if (from === to) return;
    const duration = 400;
    const steps = Math.min(Math.abs(to - from), 20);
    const stepTime = duration / steps;
    let current = from;
    const inc = (to - from) / steps;
    const timer = setInterval(() => {
      current += inc;
      el.innerText = Math.round(current);
      if ((inc > 0 && current >= to) || (inc < 0 && current <= to)) {
        el.innerText = to;
        clearInterval(timer);
      }
    }, stepTime);
  }

  // Detect which portal (if any) the active tab belongs to and highlight it
  function detectActivePortal(url) {
    const map = [
      {
        id: "arbeitsagentur-btn",
        label: "Arbeitsagentur",
        test: (u) => u.includes("arbeitsagentur.de"),
      },
      {
        id: "ausbildung-btn",
        label: "Ausbildung.de",
        test: (u) => u.includes("ausbildung.de"),
      },
      {
        id: "aubiplus-btn",
        label: "Aubi-Plus.de",
        test: (u) => u.includes("aubi-plus.de"),
      },
      {
        id: "azubi-btn",
        label: "Azubi.de",
        test: (u) => u.includes("azubi.de"),
      },
      {
        id: "gmaps-btn",
        label: "Google Maps",
        test: (u) =>
          u.includes("google.com/maps") ||
          u.includes("google.de/maps") ||
          u.includes("dasoertliche.de"),
      },
    ];
    let matched = null;
    map.forEach(({ id, label, test }) => {
      const btn = document.getElementById(id);
      if (url && test(url)) {
        if (btn) btn.classList.add("portal-active");
        matched = label;
      } else {
        if (btn) btn.classList.remove("portal-active");
      }
    });
    if (activeSiteBadge) {
      if (matched) {
        activeSiteBadge.innerText = matched;
        activeSiteBadge.classList.remove("hidden");
      } else {
        activeSiteBadge.classList.add("hidden");
      }
    }
    return matched;
  }

  // GMaps UI Elements
  const gmapsBtn = document.getElementById("gmaps-btn");
  const gmapsKeyword = document.getElementById("gmaps-keyword");
  const gmapsCity = document.getElementById("gmaps-city");
  const gmapsSearchBtn = document.getElementById("gmaps-search-btn");
  const gmapsBackBtn = document.getElementById("gmaps-back-btn");

  // Settings
  const notifyCaptchaCheckbox = document.getElementById("notify-captcha");
  const notifyFinishCheckbox = document.getElementById("notify-finish");
  const initialBtns = document.getElementById("initial-btns");
  const ongoingBtns = document.getElementById("ongoing-btns");

  let currentLang = "en";

  function applyLanguage(lang) {
    currentLang = lang;
    document.body.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (i18n[lang][key]) {
        el.innerText = i18n[lang][key];
      }
    });

    // Translate placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (i18n[lang][key]) {
        el.placeholder = i18n[lang][key];
      }
    });

    document
      .getElementById("lang-en")
      .classList.toggle("active", lang === "en");
    document
      .getElementById("lang-ar")
      .classList.toggle("active", lang === "ar");

    chrome.storage.local.set({ uiLang: lang });

    const statusClass = statusText.className;
    if (statusClass.includes("status-idle"))
      statusText.innerText = i18n[lang]["statusIdle"];
    else if (statusClass.includes("status-running"))
      statusText.innerText = i18n[lang]["statusRunning"];
    else if (statusClass.includes("status-finished"))
      statusText.innerText = i18n[lang]["statusFinished"];
    else if (statusClass.includes("status-paused")) {
      if (
        statusText.innerText === i18n["en"]["waitingCaptcha"] ||
        statusText.innerText === i18n["ar"]["waitingCaptcha"]
      ) {
        statusText.innerText = i18n[lang]["waitingCaptcha"];
      } else {
        statusText.innerText = i18n[lang]["statusPaused"];
      }
    }
  }

  document
    .getElementById("lang-en")
    .addEventListener("click", () => applyLanguage("en"));
  document
    .getElementById("lang-ar")
    .addEventListener("click", () => applyLanguage("ar"));

  // Theme logic
  let currentTheme = "light";
  const themeToggleBtn = document.getElementById("theme-toggle");
  const iconSun = document.getElementById("theme-icon-sun");
  const iconMoon = document.getElementById("theme-icon-moon");

  function applyTheme(theme) {
    currentTheme = theme;
    if (theme === "dark") {
      document.body.setAttribute("data-theme", "dark");
      iconMoon.classList.add("hidden");
      iconSun.classList.remove("hidden");
    } else {
      document.body.removeAttribute("data-theme");
      iconSun.classList.add("hidden");
      iconMoon.classList.remove("hidden");
    }
    chrome.storage.local.set({ uiTheme: theme });
  }

  themeToggleBtn.addEventListener("click", () => {
    applyTheme(currentTheme === "light" ? "dark" : "light");
  });

  // 1. Load language preference and show scraper directly
  chrome.storage.local.get(["uiLang", "uiTheme"], (res) => {
    applyLanguage(res.uiLang || "en");
    applyTheme(res.uiTheme || "light");
    loadState();
  });

  // 2. Main Scraper Logic
  function loadState() {
    chrome.storage.local.get(
      [
        "notifyCaptcha",
        "notifyFinish",
        "scrapedData",
        "isScraping",
        "isPaused",
        "targetLimit",
        "scrapeStartTime",
        "finalElapsed",
        "finalSpeed",
      ],
      (result) => {
        notifyCaptchaCheckbox.checked = result.notifyCaptcha !== false;
        notifyFinishCheckbox.checked = result.notifyFinish !== false;

        if (result.scrapedData) {
          countDisplay.innerText = result.scrapedData.length;
          downloadExcelBtn.disabled = result.scrapedData.length === 0;
          updateProgress();
        }

        if (result.targetLimit) {
          limitInput.value = result.targetLimit;
        }

        if (result.isScraping) {
          updateUI(result.isPaused ? "paused" : "running");
        } else if (result.scrapedData && result.scrapedData.length > 0) {
          updateUI("finished");
          // Restore final metrics for finished state
          PopupMetrics.restoreFinished(metricsRow, result);
        } else {
          updateUI("idle");
        }

        syncSettings();
      },
    );
  }

  function getSettings() {
    return {
      notifyCaptcha: notifyCaptchaCheckbox.checked,
      notifyFinish: notifyFinishCheckbox.checked,
    };
  }

  /**
   * Helper to safely send messages to the active tab
   * Enhanced with auto-injection and loading state handling
   */
  async function sendMessageToTab(message, callback, retryCount = 0) {
    const [currTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!currTab || !currTab.id || !isUrlValid(currTab.url)) {
      console.warn("Cannot send message: No active compatible tab found.");
      if (callback) callback(null);
      return;
    }

    // Handle loading state
    if (currTab.status === "loading" && retryCount < 3) {
      console.log("Tab is loading, retrying in 1s...");
      if (retryCount === 0 && activityLog) {
        activityLog.innerText = "Connecting to page...";
        activityLog.classList.add("active");
      }
      setTimeout(
        () => sendMessageToTab(message, callback, retryCount + 1),
        1000,
      );
      return;
    }

    chrome.tabs.sendMessage(currTab.id, message, async (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        console.warn("Message error:", errorMsg);

        // If content script is missing, try to inject it (only if we haven't retried too many times)
        if (
          retryCount < 3 &&
          (errorMsg.includes("Could not establish connection") ||
            errorMsg.includes("Receiving end does not exist"))
        ) {
          console.log("Content script missing. Attempting manual injection...");
          if (activityLog) {
            activityLog.innerText = "Initializing content script...";
            activityLog.classList.add("active");
          }
          try {
            let scriptToInject = "content_script.js";
            if (
              currTab.url &&
              currTab.url.includes("google.") &&
              currTab.url.includes("map")
            ) {
              scriptToInject = "gmaps_script.js";
            } else if (currTab.url && currTab.url.includes("ausbildung.de")) {
              scriptToInject = "ausbildung_script.js";
            } else if (currTab.url && currTab.url.includes("aubi-plus.de")) {
              scriptToInject = "aubiplus_script.js";
            } else if (currTab.url && currTab.url.includes("azubi.de")) {
              scriptToInject = "azubi_script.js";
            }

            await chrome.scripting.executeScript({
              target: { tabId: currTab.id },
              files: ["utils.js", scriptToInject],
            });
            // Wait a bit for initialization then retry once
            setTimeout(
              () => sendMessageToTab(message, callback, retryCount + 1),
              500,
            );
          } catch (injectError) {
            console.error("Injection failed:", injectError);
            if (callback) callback(null);
          }
        } else {
          if (callback) callback(null);
        }
        return;
      }
      if (callback) callback(response);
    });
  }

  function isUrlValid(url) {
    if (!url) return false;
    // Loosen to cover search results and landing pages
    return (
      url.includes("arbeitsagentur.de/jobsuche/") ||
      url.includes("arbeitsagentur.de/ksw/ergebnisliste") ||
      url.includes("ausbildung.de") ||
      url.includes("aubi-plus.de") ||
      url.includes("azubi.de") ||
      (url.includes("google.") && url.includes("map")) ||
      url.includes("dasoertliche.de")
    );
  }

  async function syncSettings() {
    sendMessageToTab({ settings: getSettings() });
  }

  function saveSettings() {
    chrome.storage.local.set(getSettings());
    syncSettings();
  }

  notifyCaptchaCheckbox.addEventListener("change", saveSettings);
  notifyFinishCheckbox.addEventListener("change", saveSettings);
  limitInput.addEventListener("change", () => {
    const newLimit = parseInt(limitInput.value) || 50;
    chrome.storage.local.set({ targetLimit: newLimit });
    updateProgress();

    // If currently scraping, notify the active script about the new limit
    if (statusText.innerText === i18n[currentLang]["statusRunning"] ||
      statusText.innerText === i18n[currentLang]["statusPaused"]) {
      sendMessageToTab({ action: "updateLimit", limit: newLimit }, () => { });
    }
  });

  function updateUI(status, data) {
    if (status === "running")
      statusText.innerText = i18n[currentLang]["statusRunning"];
    else if (status === "paused")
      statusText.innerText = i18n[currentLang]["statusPaused"];
    else if (status === "finished")
      statusText.innerText = i18n[currentLang]["statusFinished"];
    else statusText.innerText = i18n[currentLang]["statusIdle"];

    statusText.className = `status-value status-${status}`;

    // Pulse dot: only visible when actively running
    if (pulseDot) {
      pulseDot.classList.toggle("active", status === "running");
      pulseDot.style.background =
        status === "paused" ? "var(--warning)" : "var(--accent-2)";
    }

    if (status === "running") {
      initialBtns.classList.add("hidden");
      ongoingBtns.classList.remove("hidden");
      pauseBtn.classList.remove("hidden");
      resumeBtn.classList.add("hidden");

      progressContainer.classList.add("active");
      activityLog.classList.add("active");
      statusCard.classList.add("running");
      if (metricsRow) metricsRow.classList.remove("hidden");
      PopupMetrics.startEtaTimer();
      if (
        activityLog.innerText === "Ready to start..." ||
        activityLog.innerText === "Ready to download." ||
        activityLog.innerText.includes("Stopped early")
      ) {
        activityLog.innerText = "Extracting data...";
      }
    } else if (status === "paused") {
      initialBtns.classList.add("hidden");
      ongoingBtns.classList.remove("hidden");
      pauseBtn.classList.add("hidden");
      resumeBtn.classList.remove("hidden");

      progressContainer.classList.add("active");
      activityLog.classList.add("active");
      PopupMetrics.stopEtaTimer();
    } else if (status === "idle" || status === "finished") {
      initialBtns.classList.remove("hidden");
      ongoingBtns.classList.add("hidden");
      statusCard.classList.remove("running");
      PopupMetrics.stopEtaTimer();

      if (status === "finished") {
        progressContainer.classList.add("active");
        activityLog.classList.add("active");
        if (metricsRow) metricsRow.classList.remove("hidden");

        if (data && (data.early || data.empty)) {
          activityLog.innerText = "Stopped early: no more emails found.";
        } else {
          activityLog.innerText = "Ready to download.";
        }
        updateProgress(); // Sets real % instead of forcing 100%
      } else {
        progressContainer.classList.remove("active");
        activityLog.classList.remove("active");
        if (metricsRow) metricsRow.classList.add("hidden");
        if (progressRing) progressRing.style.strokeDashoffset = 364.42;
        activityLog.innerText = "Ready to start...";
        PopupMetrics.resetDisplay();
      }
    }

    // Export button label
    const count = parseInt(countDisplay.innerText) || 0;
    if (downloadExcelBtn) downloadExcelBtn.disabled = count === 0;
  }

  // Get initial info about total offers
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Highlight the portal matching the current tab
  const activePortalLabel = detectActivePortal(tab ? tab.url : "");

  // Per-portal limit: restore saved limit for the active portal
  if (activePortalLabel) {
    chrome.storage.local.get(['portalLimits'], (res) => {
      const limits = res.portalLimits || {};
      const key = activePortalLabel.toLowerCase().replace(/[^a-z]/g, '');
      if (limits[key]) {
        limitInput.value = limits[key];
        updateProgress();
      }
    });
  }

  // Save limit per portal when changed
  limitInput.addEventListener('change', () => {
    chrome.storage.local.get(['portalLimits'], (res) => {
      const limits = res.portalLimits || {};
      const key = activePortalLabel ? activePortalLabel.toLowerCase().replace(/[^a-z]/g, '') : 'googlemaps';
      limits[key] = parseInt(limitInput.value) || 50;
      chrome.storage.local.set({ portalLimits: limits });
    });
  });

  // Auto-navigate removed based on user request

  if (tab && tab.id && isUrlValid(tab.url)) {
    sendMessageToTab({ action: "getInitialInfo" }, (response) => {
      if (response) {
        if (response.total) {
          totalDisplay.innerText = response.total;
          updateProgress();
        }
        if (response.scrapedCount !== undefined) {
          countDisplay.innerText = response.scrapedCount;
          updateProgress();
        }
        if (response.isScraping)
          updateUI(response.isPaused ? "paused" : "running");
        else if (response.scrapedCount > 0) updateUI("finished");
        else updateUI("idle");

        // Auto-count total if not provided by getInitialInfo and not already scraping
        if (!response.total && !response.isScraping) {
          sendMessageToTab({ action: "countResults" }, (countResponse) => {
            if (countResponse && countResponse.total !== undefined) {
              totalDisplay.innerText = countResponse.total;
              limitInput.value = Math.min(
                parseInt(limitInput.value),
                countResponse.total,
              );
              updateProgress();
            }
          });
        }
      }
    });
  }



  startBtn.addEventListener("click", async () => {
    const limit = parseInt(limitInput.value) || 50;
    chrome.storage.local.set({ targetLimit: limit });

    sendMessageToTab(
      { action: "start", limit, settings: getSettings() },
      (response) => {
        if (response && response.status === "started") {
          updateUI("running");
        } else if (!response) {
          statusText.innerText = i18n[currentLang]["refreshPage"];
        }
      },
    );
  });

  pauseBtn.addEventListener("click", async () => {
    sendMessageToTab({ action: "pause" }, (response) => {
      if (response && response.status === "paused") {
        updateUI("paused");
      }
    });
  });

  resumeBtn.addEventListener("click", async () => {
    sendMessageToTab({ action: "resume" }, (response) => {
      if (response && response.status === "resumed") {
        updateUI("running");
      }
    });
  });

  stopBtn.addEventListener("click", async () => {
    sendMessageToTab({ action: "stop" }, (response) => {
      if (response && response.status === "stopped") {
        updateUI("idle");
      }
    });
  });

  resetBtn.addEventListener("click", async () => {
    const modal = document.getElementById("confirmModal");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");

    modal.classList.add("show");

    confirmBtn.onclick = () => {
      modal.classList.remove("show");
      sendMessageToTab({ action: "reset" }, (response) => {
        if (response && response.status === "reset") {
          countDisplay.innerText = "0";
          totalDisplay.innerText = "\u2014";
          downloadExcelBtn.disabled = true;
          updateProgress();
          updateUI("idle");
          showToast(toastContainer, i18n[currentLang]["toastReset"], "info");
          // Auto-recount after reset
          sendMessageToTab({ action: "countResults" }, (countResponse) => {
            if (countResponse && countResponse.total !== undefined) {
              totalDisplay.innerText = countResponse.total;
              updateProgress();
            }
          });
        } else if (!response) {
          updateUI("error", "Error connecting to content script.");
        }
      });
    };

    cancelBtn.onclick = () => {
      modal.classList.remove("show");
    };
  });

  arbeitsagenturBtn.addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=4&id=17907-44005832-32-S",
    });
  });

  ausbildungBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.ausbildung.de/" });
  });

  aubiplusBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.aubi-plus.de/" });
  });

  if (azubiBtn) {
    azubiBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://www.azubi.de/ausbildungsplatz" });
    });
  }

  if (gmapsBtn) {
    gmapsBtn.addEventListener("click", () => {
      mainView.classList.add("hidden");
      gmapsView.classList.remove("hidden");
    });
  }

  if (gmapsBackBtn) {
    gmapsBackBtn.addEventListener("click", () => {
      gmapsView.classList.add("hidden");
      mainView.classList.remove("hidden");
    });
  }

  if (gmapsSearchBtn) {
    gmapsSearchBtn.addEventListener("click", () => {
      const kw = gmapsKeyword.value.trim();
      const city = gmapsCity.value.trim();
      if (kw && city) {
        // Save exact query to storage so the scraper doesn't rely on Google Maps URL parsing
        chrome.storage.local.set(
          { lastGmapsKw: kw, lastGmapsCity: city },
          () => {
            const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kw)}+in+${encodeURIComponent(city)}`;
            chrome.tabs.create({ url: searchUrl });
            // Auto-switch to Job Portals tab so user is ready to scrape
            tabJobs.click();
          },
        );
      }
    });
  }


  downloadExcelBtn.addEventListener("click", () => {
    sendMessageToTab({ action: "getData" }, (response) => {
      if (response && response.data) {
        downloadExcel(response.data);
        showToast(toastContainer, i18n[currentLang]["toastExported"], "success");
      }
    });
  });

  // History clear button — uses modal instead of confirm() (blocked in MV3 popups)
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      const modal = document.getElementById("confirmModal");
      const confirmBtn = document.getElementById("modalConfirm");
      const cancelBtn = document.getElementById("modalCancel");

      modal.classList.add("show");

      confirmBtn.onclick = () => {
        modal.classList.remove("show");
        chrome.storage.local.set({ scrapingHistory: [] }, () => {
          PopupHistory.render(historyList, historyEmpty);
          showToast(toastContainer, i18n[currentLang]["toastReset"], "info");
        });
      };

      cancelBtn.onclick = () => {
        modal.classList.remove("show");
      };
    });
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "progress") {
      if (request.status === "waiting_captcha") {
        updateUI("paused");
        statusText.innerText = i18n[currentLang]["waitingCaptcha"];
        activityLog.innerText = "Captcha detected... Please solve.";
        showToast(toastContainer, i18n[currentLang]["toastCaptcha"], "warning");
      } else if (request.status === "throttling") {
        // Rate limiting visualization
        activityLog.classList.add("active", "throttling");
        activityLog.innerText = `⏳ ${i18n[currentLang]["throttling"]}`;
      } else {
        // Normal progress — use portalCount if available for per-portal accuracy
        const displayCount = request.portalCount !== undefined ? request.portalCount : request.count;
        animateCount(countDisplay, displayCount);
        PopupMetrics.updateMetrics(displayCount || 0);
        activityLog.classList.remove("throttling");
        if (request.currentTitle) {
          const tempEl = document.createElement("textarea");
          tempEl.innerHTML = request.currentTitle;
          activityLog.innerText = tempEl.value;
        }
        // Update progress after animation settles
        setTimeout(updateProgress, 420);
        downloadExcelBtn.disabled = false;
        // Update preview table
        updatePreviewFromStorage();
      }
    } else if (request.action === "finished") {
      const displayCount = request.portalCount !== undefined ? request.portalCount : request.count;
      animateCount(countDisplay, displayCount);
      activityLog.classList.remove("throttling");
      setTimeout(() => {
        updateUI("finished", request);
      }, 420);
      downloadExcelBtn.disabled = false;
      const count = displayCount || 0;
      PopupMetrics.saveFinalMetrics(count);
      showToast(
        toastContainer,
        `${i18n[currentLang]["toastFinished"]} — ${count} leads`,
        "success",
      );
      PopupHistory.save(count, detectActivePortalName());
      updatePreviewFromStorage();
    } else if (request.action === "error") {
      updateUI("idle");
      activityLog.classList.add("active");
      activityLog.innerText =
        request.message || "Scraping stopped unexpectedly.";
      showToast(toastContainer, i18n[currentLang]["toastError"], "error");
    }
  });

  // ─── Data Preview (Group 3) ─────────────────────────────────────────────────
  function updatePreviewFromStorage() {
    sendMessageToTab({ action: "getData" }, (response) => {
      if (response && response.data) {
        renderPreviewTable(response.data);
      }
    });
  }

  function renderPreviewTable(data) {
    if (!previewTbody || !previewCount || !previewEmpty || !previewTableWrap)
      return;
    previewCount.textContent = data.length;
    if (data.length === 0) {
      previewEmpty.classList.remove("hidden");
      previewTableWrap.classList.add("hidden");
      return;
    }
    previewEmpty.classList.add("hidden");
    previewTableWrap.classList.remove("hidden");
    // Show last 50 entries, most recent first
    const recent = data.slice(-50).reverse();
    previewTbody.innerHTML = "";
    recent.forEach((row, i) => {
      const tr = document.createElement("tr");
      const tdNum = document.createElement("td");
      tdNum.textContent = data.length - i;
      const tdCompany = document.createElement("td");
      tdCompany.textContent = truncate(row.company || "\u2014", 22);
      tdCompany.title = row.company || "";
      const tdEmail = document.createElement("td");
      tdEmail.textContent = truncate(row.email || "\u2014", 24);
      tdEmail.title = row.email || "";
      tr.append(tdNum, tdCompany, tdEmail);
      previewTbody.appendChild(tr);
    });
  }

  function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
  }

  function detectActivePortalName() {
    const badge = activeSiteBadge;
    if (badge && badge.textContent) return badge.textContent.trim();
    return "Unknown";
  }

  // Load preview on popup open
  updatePreviewFromStorage();
});
