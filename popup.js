document.addEventListener("DOMContentLoaded", async () => {
  // View Elements
  const mainView = document.getElementById("main-view");

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

  // GMaps UI Elements
  const gmapsBtn = document.getElementById("gmaps-btn");
  const gmapsView = document.getElementById("gmaps-view");
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
      statusIdle: "Idle",
      statusFinished: "Finished",
      statusRunning: "Running",
      statusPaused: "Paused",
      targetLabel: "Target Number of Offers",
      countBtn: "Count Available",
      startBtn: "Start Scraping",
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
      captchaLabel: "Captcha Sound",
      finishLabel: "Finish Sound",
      noteTitle: "Note:",
      noteDesc: "Solve captchas manually if they appear to keep the scraper running.",
      downloadBtn: "Download CSV Results",
      applyingFilters: "Applying filters...",
      refreshPage: "Please refresh the page",
      waitingCaptcha: "Waiting for Captcha",
      gmapsTitle: "Google Maps Scraper",
      gmapsKwParams: "Search Keyword",
      gmapsCityParams: "City / Location",
      gmapsSearchBtn: "Search on Maps",
      gmapsBackBtn: "Back",
    },
    ar: {
      titleText: "AutoAzubi Extractor",
      subtitleText: "أداة الاستخراج المميزة",
      statusTitle: "الحالة الحالية",
      statusIdle: "خامل",
      statusFinished: "مكتمل",
      statusRunning: "قيد التشغيل",
      statusPaused: "متوقف مؤقتاً",
      targetLabel: "العدد المستهدف للعروض",
      countBtn: "حساب المتاح",
      startBtn: "بدء الاستخراج",
      resetBtn: "إعادة ضبط",
      arbBtn: "انتقل إلى Arbeitsagentur",
      ausBtn: "اذهب إلى Ausbildung.de",
      aubiBtn: "اذهب إلى Aubi-Plus.de",
      azubiBtn: "افتح Azubi.de",
      gmapsBtn: "الذهاب إلى خرائط جوجل",
      pauseBtn: "إيقاف مؤقت",
      resumeBtn: "استئناف",
      stopBtn: "إيقاف",
      settingsTitle: "الإعدادات",
      captchaLabel: "صوت الكابتشا",
      finishLabel: "صوت الانتهاء",
      noteTitle: "ملاحظة:",
      noteDesc: "قم بحل الكابتشا يدويًا إذا ظهرت لإبقاء المستخرج قيد التشغيل.",
      downloadBtn: "تحميل نتائج CSV",
      applyingFilters: "جارِ تطبيق الفلاتر...",
      refreshPage: "يرجى تحديث الصفحة",
      waitingCaptcha: "في انتظار الكابتشا",
      gmapsTitle: "استخراج من خرائط جوجل",
      gmapsKwParams: "الكلمة المفتاحية",
      gmapsCityParams: "المدينة / الموقع",
      gmapsSearchBtn: "البحث في الخرائط",
      gmapsBackBtn: "رجوع",
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

  // 1. Load language preference and show scraper directly
  chrome.storage.local.get(["uiLang"], (res) => {
    applyLanguage(res.uiLang || "en");
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
      ],
      (result) => {
        notifyCaptchaCheckbox.checked = result.notifyCaptcha !== false;
        notifyFinishCheckbox.checked = result.notifyFinish !== false;

        if (result.scrapedData) {
          countDisplay.innerText = result.scrapedData.length;
          downloadBtn.disabled = result.scrapedData.length === 0;
        }

        if (result.targetLimit) {
          limitInput.value = result.targetLimit;
        }

        if (result.isScraping) {
          updateUI(result.isPaused ? "paused" : "running");
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

        // If content script is missing, try to inject it
        if (
          errorMsg.includes("Could not establish connection") ||
          errorMsg.includes("Receiving end does not exist")
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
              files: [scriptToInject],
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

  function updateUI(status) {
    if (status === "running")
      statusText.innerText = i18n[currentLang]["statusRunning"];
    else if (status === "paused")
      statusText.innerText = i18n[currentLang]["statusPaused"];
    else if (status === "finished")
      statusText.innerText = i18n[currentLang]["statusFinished"];
    else statusText.innerText = i18n[currentLang]["statusIdle"];

    statusText.className = `status-${status}`;

    if (status === "running") {
      initialBtns.classList.add("hidden");
      ongoingBtns.classList.remove("hidden");
      pauseBtn.classList.remove("hidden");
      resumeBtn.classList.add("hidden");
    } else if (status === "paused") {
      initialBtns.classList.add("hidden");
      ongoingBtns.classList.remove("hidden");
      pauseBtn.classList.add("hidden");
      resumeBtn.classList.remove("hidden");
    } else if (status === "idle" || status === "finished") {
      initialBtns.classList.remove("hidden");
      ongoingBtns.classList.add("hidden");
    }
  }

  // Get initial info about total offers
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Auto-navigate removed based on user request

  if (tab && tab.id && isUrlValid(tab.url)) {
    sendMessageToTab({ action: "getInitialInfo" }, (response) => {
      if (response) {
        if (response.total) totalDisplay.innerText = response.total;
        if (response.scrapedCount !== undefined)
          countDisplay.innerText = response.scrapedCount;
        if (response.isScraping)
          updateUI(response.isPaused ? "paused" : "running");
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
      }
    });
  });

  startBtn.addEventListener("click", async () => {
    const limit = parseInt(limitInput.value) || 50;

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
    if (confirm("Are you sure you want to clear all scraped data?")) {
      sendMessageToTab({ action: "reset" }, (response) => {
        if (response && response.status === "reset") {
          countDisplay.innerText = "0";
          totalDisplay.innerText = "?";
          downloadBtn.disabled = true;
          updateUI("idle");
        } else if (!response) {
          statusText.innerText = i18n[currentLang]["refreshPage"];
        }
      });
    }
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
        const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kw)}+in+${encodeURIComponent(city)}`;
        chrome.tabs.create({ url: searchUrl });
      }
    });
  }

  downloadBtn.addEventListener("click", async () => {
    sendMessageToTab({ action: "getData" }, (response) => {
      if (response && response.data) {
        downloadCSV(response.data);
      }
    });
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "progress") {
      if (request.status === "waiting_captcha") {
        updateUI("paused");
        statusText.innerText = i18n[currentLang]["waitingCaptcha"];
      } else {
        countDisplay.innerText = request.count;
        downloadBtn.disabled = false;
      }
    } else if (request.action === "finished") {
      updateUI("finished");
      countDisplay.innerText = request.count;
      downloadBtn.disabled = false;
    }
  });

  function downloadCSV(data) {
    // Deduplicate before export:
    // - rows with email: deduplicate by email (case-insensitive)
    // - rows without email: deduplicate by company+address
    const seenEmails = new Set();
    const seenCompanyAddr = new Set();
    data = data.filter((row) => {
      const email = (row.email || '').trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) return false;
        seenEmails.add(email);
        return true;
      }
      // No email — deduplicate by company+address
      const key = `${(row.company || '').trim().toLowerCase()}|${(row.address || '').trim().toLowerCase()}`;
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
        const anrede = contact.trim().split(" ")[0] || "";
        const values = [
          row.company || "",
          row.email || "",
          row.address || "",
          contact,
          anrede,
          row.link || "",
          row.phone || "",
        ];
        return values.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `scraped_jobs_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
});
