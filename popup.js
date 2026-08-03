document.addEventListener("DOMContentLoaded", async () => {
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
      renderHistory();
    });
  }

  // Scraper UI Elements
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const countBtn = document.getElementById("count-btn");
  const resetBtn = document.getElementById("reset-btn");
  const arbeitsagenturBtn = document.getElementById("arbeitsagentur-btn");
  const ausbildungBtn = document.getElementById("ausbildung-btn");
  const aubiplusBtn = document.getElementById("aubiplus-btn");
  const azubiBtn = document.getElementById("azubi-btn");
  const downloadBtn = document.getElementById("download-btn");
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
  const elapsedTimeEl = document.getElementById("elapsed-time");
  const scrapeSpeedEl = document.getElementById("scrape-speed");
  const etaTimeEl = document.getElementById("eta-time");

  // Preview elements (Group 3)
  const previewCount = document.getElementById("preview-count");
  const previewTbody = document.getElementById("preview-tbody");
  const previewEmpty = document.getElementById("preview-empty");
  const previewTableWrap = document.getElementById("preview-table-wrap");


  // Toast container (Group 2)
  const toastContainer = document.getElementById("toast-container");

  // ETA timer state
  let etaInterval = null;
  let scrapeStartTime = null;
  let lastKnownCount = 0;

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

  const i18n = {
    en: {
      titleText: "AutoAzubi Extractor",
      subtitleText: "Automated Data Extractor",
      statusTitle: "Current Status",
      statusIdle: "Ready",
      statusFinished: "Completed",
      statusRunning: "Extracting",
      statusPaused: "Paused",
      targetLabel: "Extraction Limit",
      countBtn: "Count Offers",
      startBtn: "Start Extraction",
      resetBtn: "Reset",
      arbBtn: "Open Arbeitsagentur",
      ausBtn: "Open Ausbildung.de",
      aubiBtn: "Open Aubi-Plus.de",
      azubiBtn: "Open Azubi.de",
      gmapsBtn: "Open Google Maps",
      pauseBtn: "Pause",
      resumeBtn: "Resume",
      stopBtn: "Stop",
      settingsTitle: "Settings",
      tabJobs: "Job Portals",
      tabGmaps: "Google Maps",
      captchaLabel: "Captcha Sound",
      finishLabel: "Finish Sound",
      noteTitle: "Note:",
      noteDesc:
        "Please resolve any Captcha challenges manually to resume data extraction.",
      downloadBtn: "Export Data",
      applyingFilters: "Applying filters...",
      refreshPage: "Please refresh the page",
      waitingCaptcha: "Waiting for Captcha",
      gmapsTitle: "Google Maps Extractor",
      gmapsKwParams: "Search Industry",
      gmapsCityParams: "Target City",
      gmapsSearchBtn: "Search on Google Maps",
      gmapsBackBtn: "Back",
      modalTitle: "Clear Data",
      modalDesc:
        "Are you sure you want to clear all scraped data? This action cannot be undone.",
      modalCancel: "Cancel",
      modalConfirm: "Clear All",
      gmapsKwPlaceholder: "Select or type industry...",
      gmapsCityPlaceholder: "Select or type city...",
      tabHistory: "History",
      previewTitle: "Data Preview",
      previewCompany: "Company",
      previewEmail: "Email",
      previewEmpty: "No data extracted yet",
      historyEmpty: "No scraping sessions yet",
      clearHistoryBtn: "Clear",
      toastFinished: "Extraction complete",
      toastError: "Extraction failed",
      toastCaptcha: "Captcha detected — solve to continue",
      toastExported: "Data exported successfully",
      toastReset: "All data cleared",
    },
    ar: {
      titleText: "AutoAzubi Extractor",
      subtitleText: "أداة استخراج البيانات الآلية",
      statusTitle: "الحالة الحالية",
      statusIdle: "جاهز",
      statusFinished: "مكتمل",
      statusRunning: "استخراج",
      statusPaused: "متوقف مؤقتاً",
      targetLabel: "الحد الأقصى للاستخراج",
      countBtn: "عدّ العروض",
      startBtn: "بدء الاستخراج",
      resetBtn: "إعادة ضبط",
      arbBtn: "افتح Arbeitsagentur",
      ausBtn: "افتح Ausbildung.de",
      aubiBtn: "افتح Aubi-Plus.de",
      azubiBtn: "افتح Azubi.de",
      gmapsBtn: "افتح خرائط جوجل",
      pauseBtn: "إيقاف مؤقت",
      resumeBtn: "استئناف",
      stopBtn: "إيقاف",
      settingsTitle: "الإعدادات",
      tabJobs: "بوابات الوظائف",
      tabGmaps: "خرائط جوجل",
      captchaLabel: "صوت الكابتشا",
      finishLabel: "صوت الانتهاء",
      noteTitle: "ملاحظة:",
      noteDesc: "يرجى حل أي تحديات كابتشا يدويًا لاستئناف استخراج البيانات.",
      downloadBtn: "تصدير البيانات",
      applyingFilters: "جارِ تطبيق الفلاتر...",
      refreshPage: "يرجى تحديث الصفحة",
      waitingCaptcha: "في انتظار الكابتشا",
      gmapsTitle: "مستخرج خرائط جوجل",
      gmapsKwParams: "ابحث عن المجال",
      gmapsCityParams: "المدينة المستهدفة",
      gmapsSearchBtn: "البحث في خرائط جوجل",
      gmapsBackBtn: "رجوع",
      modalTitle: "مسح البيانات",
      modalDesc:
        "هل أنت متأكد أنك تريد مسح جميع البيانات المستخرجة؟ لا يمكن التراجع عن هذا الإجراء.",
      modalCancel: "إلغاء",
      modalConfirm: "مسح الكل",
      gmapsKwPlaceholder: "اختر أو اكتب المجال...",
      gmapsCityPlaceholder: "اختر أو اكتب المدينة...",
      tabHistory: "السجل",
      previewTitle: "معاينة البيانات",
      previewCompany: "الشركة",
      previewEmail: "البريد",
      previewEmpty: "لم يتم استخراج بيانات بعد",
      historyEmpty: "لا توجد جلسات استخراج بعد",
      clearHistoryBtn: "مسح",
      toastFinished: "اكتمل الاستخراج",
      toastError: "فشل الاستخراج",
      toastCaptcha: "تم اكتشاف كابتشا - قم بحلها للمتابعة",
      toastExported: "تم تصدير البيانات بنجاح",
      toastReset: "تم مسح جميع البيانات",
    },
  };

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
          downloadBtn.disabled = result.scrapedData.length === 0;
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
          restoreFinishedMetrics(result);
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
    chrome.storage.local.set({ targetLimit: parseInt(limitInput.value) || 50 });
    updateProgress();
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
      startEtaTimer();
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
      stopEtaTimer();
    } else if (status === "idle" || status === "finished") {
      initialBtns.classList.remove("hidden");
      ongoingBtns.classList.add("hidden");
      statusCard.classList.remove("running");
      stopEtaTimer();

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
        resetEtaDisplay();
      }
    }

    // Download button label
    const count = parseInt(countDisplay.innerText) || 0;
    if (downloadBtn) {
      const span = downloadBtn.querySelector("span[data-i18n]");
      if (span) {
        span.innerText =
          count > 0
            ? i18n[currentLang]["downloadBtn"]
            : currentLang === "ar"
              ? "لا توجد بيانات بعد"
              : "No data yet";
      }
    }
  }

  // Get initial info about total offers
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Highlight the portal matching the current tab
  detectActivePortal(tab ? tab.url : "");

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

  countBtn.addEventListener("click", async () => {
    statusText.innerText = i18n[currentLang]["applyingFilters"];
    countBtn.disabled = true;

    sendMessageToTab({ action: "countResults" }, (response) => {
      countBtn.disabled = false;
      updateUI("idle");
      if (response && response.total !== undefined) {
        totalDisplay.innerText = response.total;
        limitInput.value = Math.min(parseInt(limitInput.value), response.total);
        updateProgress();
      }
    });
  });

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
          totalDisplay.innerText = "?";
          downloadBtn.disabled = true;
          updateProgress();
          updateUI("idle");
          setTimeout(() => countBtn.click(), 100);
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

  downloadBtn.addEventListener("click", () => {
    sendMessageToTab({ action: "getData" }, (response) => {
      if (response && response.data) {
        downloadCSV(response.data);
        showToast(i18n[currentLang]["toastExported"], "success");
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
          renderHistory();
          showToast(i18n[currentLang]["toastReset"], "info");
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
        showToast(i18n[currentLang]["toastCaptcha"], "warning");
      } else {
        animateCount(countDisplay, request.count);
        lastKnownCount = request.count || 0;
        updateEtaMetrics(lastKnownCount);
        if (request.currentTitle) {
          const tempEl = document.createElement("textarea");
          tempEl.innerHTML = request.currentTitle;
          activityLog.innerText = tempEl.value;
        }
        // Update progress after animation settles
        setTimeout(updateProgress, 420);
        downloadBtn.disabled = false;
        // Update download button label live
        const span = downloadBtn.querySelector("span[data-i18n]");
        if (span) span.innerText = i18n[currentLang]["downloadBtn"];
        // Update preview table
        updatePreviewFromStorage();
      }
    } else if (request.action === "finished") {
      animateCount(countDisplay, request.count);
      setTimeout(() => {
        updateUI("finished", request);
      }, 420);
      downloadBtn.disabled = false;
      const count = request.count || 0;
      saveFinalMetrics(count);
      showToast(`${i18n[currentLang]["toastFinished"]} — ${count} leads`, "success");
      saveToHistory(count);
      updatePreviewFromStorage();
    } else if (request.action === "error") {
      updateUI("idle");
      activityLog.classList.add("active");
      activityLog.innerText =
        request.message || "Scraping stopped unexpectedly.";
      showToast(i18n[currentLang]["toastError"], "error");
    }
  });

  function downloadCSV(data) {
    // Deduplicate before export:
    // - rows with email: deduplicate by email (case-insensitive)
    // - rows without email: deduplicate by company+address
    const seenEmails = new Set();
    const seenCompanyAddr = new Set();
    data = data.filter((row) => {
      const email = (row.email || "").trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) return false;
        seenEmails.add(email);
        return true;
      }
      // No email — deduplicate by company+address
      const key = `${(row.company || "").trim().toLowerCase()}|${(row.address || "").trim().toLowerCase()}`;
      if (seenCompanyAddr.has(key)) return false;
      seenCompanyAddr.add(key);
      return true;
    });

    const headers = [
      "Company Name",
      "Email",
      "Address",
      "Ansprechpartner",
      "Anrede",
      "Website",
      "Telephone",
    ];
    const csvContent = [
      headers.join(","),
      ...data.map((row) => {
        const contact = row.contact || "";
        const firstWord = contact.trim().split(" ")[0] || "";
        const validTitles = ["Herr", "Frau", "Dr.", "Prof.", "Herrn"];
        const anrede = validTitles.includes(firstWord) ? firstWord : "";

        const values = [
          row.company || "",
          row.email || "",
          row.address || "",
          contact,
          anrede,
          row.link || "",
          row.phone || "",
        ];
        return values
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      }),
    ].join("\n");

    // Prepend UTF-8 BOM (\uFEFF) to ensure Microsoft Excel correctly renders German umlauts (ä, ö, ü)
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `autoazubi_leads_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }


  // ─── Toast Notifications (Group 2) ──────────────────────────────────────────
  function showToast(message, type = "info", duration = 4000) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    };
    // Build toast safely — use textContent for the message to prevent XSS
    const iconDiv = document.createElement('div');
    iconDiv.className = 'toast-icon';
    iconDiv.innerHTML = icons[type] || icons.info;
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = message;
    const progressDiv = document.createElement('div');
    progressDiv.className = 'toast-progress';
    progressDiv.innerHTML = '<div class="toast-progress-bar"></div>';
    toast.appendChild(iconDiv);
    toast.appendChild(msgSpan);
    toast.appendChild(progressDiv);
    toastContainer.appendChild(toast);
    // Trigger entrance animation
    requestAnimationFrame(() => toast.classList.add("toast-show"));

    // Auto-dismiss
    const progressBar = toast.querySelector(".toast-progress-bar");
    if (progressBar) {
      progressBar.style.transition = `width ${duration}ms linear`;
      requestAnimationFrame(() => (progressBar.style.width = "0%"));
    }
    setTimeout(() => {
      toast.classList.remove("toast-show");
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ─── Data Preview (Group 3) ─────────────────────────────────────────────────
  function updatePreviewFromStorage() {
    sendMessageToTab({ action: "getData" }, (response) => {
      if (response && response.data) {
        renderPreviewTable(response.data);
      }
    });
  }

  function renderPreviewTable(data) {
    if (!previewTbody || !previewCount || !previewEmpty || !previewTableWrap) return;
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
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
  }

  // ─── Scraping History (Group 4) ─────────────────────────────────────────────
  function saveToHistory(count) {
    chrome.storage.local.get(["scrapingHistory", "scrapeStartTime"], (result) => {
      const history = result.scrapingHistory || [];
      const startTime = result.scrapeStartTime || Date.now();
      const durationMs = Date.now() - startTime;
      const portal = detectActivePortalName();
      history.unshift({
        id: Date.now().toString(36),
        portal,
        date: new Date().toISOString(),
        leadsFound: count,
        durationMs,
      });
      // Keep only last 20 sessions
      if (history.length > 20) history.length = 20;
      chrome.storage.local.set({ scrapingHistory: history });
    });
  }

  function detectActivePortalName() {
    const badge = activeSiteBadge;
    if (badge && badge.textContent) return badge.textContent.trim();
    return "Unknown";
  }

  function renderHistory() {
    if (!historyList || !historyEmpty) return;
    chrome.storage.local.get(["scrapingHistory"], (result) => {
      const history = result.scrapingHistory || [];
      if (history.length === 0) {
        historyEmpty.classList.remove("hidden");
        historyList.querySelectorAll(".history-card").forEach((c) => c.remove());
        return;
      }
      historyEmpty.classList.add("hidden");
      // Remove old cards, keep the empty message element
      historyList.querySelectorAll(".history-card").forEach((c) => c.remove());

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
        const dur = formatDuration(s.durationMs || 0);
        const speed = s.durationMs > 6000 ? ((s.leadsFound / (s.durationMs / 60000)).toFixed(1) + "/min") : "\u2014";

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
        historyList.appendChild(card);
      });
    });
  }

  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec}s`;
  }

  // ─── ETA Timer & Metrics (Group 6) ──────────────────────────────────────────
  function startEtaTimer() {
    chrome.storage.local.get(["scrapeStartTime"], (result) => {
      scrapeStartTime = result.scrapeStartTime || Date.now();
      if (!result.scrapeStartTime) {
        chrome.storage.local.set({ scrapeStartTime });
      }
      stopEtaTimer();
      etaInterval = setInterval(tickElapsed, 1000);
      tickElapsed();
    });
  }

  function stopEtaTimer() {
    if (etaInterval) {
      clearInterval(etaInterval);
      etaInterval = null;
    }
  }

  function resetEtaDisplay() {
    if (elapsedTimeEl) elapsedTimeEl.textContent = "0:00";
    if (scrapeSpeedEl) scrapeSpeedEl.textContent = "—";
    if (etaTimeEl) etaTimeEl.textContent = "—";
    scrapeStartTime = null;
    lastKnownCount = 0;
    chrome.storage.local.remove(["scrapeStartTime", "finalElapsed", "finalSpeed"]);
  }

  function tickElapsed() {
    if (!scrapeStartTime || !elapsedTimeEl) return;
    const elapsed = Math.floor((Date.now() - scrapeStartTime) / 1000);
    elapsedTimeEl.textContent = formatTimer(elapsed);
  }

  function updateEtaMetrics(count) {
    if (!scrapeStartTime) return;
    const elapsedSec = (Date.now() - scrapeStartTime) / 1000;
    const elapsedMin = elapsedSec / 60;
    // Speed
    if (scrapeSpeedEl && elapsedMin > 0.1) {
      const speed = count / elapsedMin;
      scrapeSpeedEl.textContent = speed.toFixed(1) + "/min";
    }
    // ETA
    const target = parseInt(limitInput.value) || 50;
    if (etaTimeEl && count > 0 && count < target) {
      const rate = count / elapsedSec; // leads per second
      const remaining = (target - count) / rate;
      etaTimeEl.textContent = "~" + formatTimer(Math.ceil(remaining));
    } else if (etaTimeEl && count >= target) {
      etaTimeEl.textContent = "Done";
    }
  }

  /**
   * Save final metrics to storage when scrape finishes,
   * so they can be restored when popup reopens.
   */
  function saveFinalMetrics(count) {
    if (!scrapeStartTime) return;
    const elapsedSec = (Date.now() - scrapeStartTime) / 1000;
    const elapsedMin = elapsedSec / 60;
    const finalElapsed = formatTimer(Math.floor(elapsedSec));
    const finalSpeed = elapsedMin > 0.1
      ? (count / elapsedMin).toFixed(1) + "/min"
      : "—";
    // Persist so popup reopen shows correct values
    chrome.storage.local.set({ finalElapsed, finalSpeed });
    // Update UI immediately
    if (elapsedTimeEl) elapsedTimeEl.textContent = finalElapsed;
    if (scrapeSpeedEl) scrapeSpeedEl.textContent = finalSpeed;
    if (etaTimeEl) etaTimeEl.textContent = "Done";
  }

  /**
   * Restore saved metrics when popup reopens and state is 'finished'.
   */
  function restoreFinishedMetrics(storageResult) {
    if (!metricsRow) return;
    const elapsed = storageResult.finalElapsed;
    const speed = storageResult.finalSpeed;
    if (elapsed || speed) {
      metricsRow.classList.remove("hidden");
      if (elapsedTimeEl) elapsedTimeEl.textContent = elapsed || "—";
      if (scrapeSpeedEl) scrapeSpeedEl.textContent = speed || "—";
      if (etaTimeEl) etaTimeEl.textContent = "Done";
    } else {
      // No stored metrics (old scrape before update) — hide the row
      metricsRow.classList.add("hidden");
    }
  }

  function formatTimer(totalSec) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  // Load preview on popup open
  updatePreviewFromStorage();
});
