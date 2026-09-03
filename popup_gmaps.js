/**
 * popup_gmaps.js — Google Maps tab logic for AutoAzubi popup
 * Handles autocomplete, search, and industry/city suggestion lists.
 * Loaded before popup.js. Exposes: window.PopupGmaps
 */
window.PopupGmaps = {
  INDUSTRIES: [
    "Systemintegration",
    "Softwareentwicklung",
    "Netzwerktechnik",
    "IT",
    "Pflege",
    "Klinik",
    "Krankenhaus",
    "Pflegedienst",
    "Altenpflege",
    "Sanitär",
    "Heizung",
    "Elektriker",
    "Einzelhandel",
    "Restaurant",
    "Gastro",
    "Hotel",
    "Spedition",
    "KFZ",
    "Automobil",
    "Marketing",
    "Handwerk"
  ],

  CITIES: [
    "Berlin",
    "München",
    "Hamburg",
    "Köln",
    "Frankfurt",
    "Stuttgart",
    "Düsseldorf",
    "Leipzig",
    "Dortmund",
    "Essen",
    "Bremen",
    "Dresden",
    "Hannover",
    "Nürnberg",
    "Duisburg",
    "Bochum",
    "Wuppertal",
    "Bielefeld",
    "Bonn",
    "Münster",
    "Karlsruhe",
    "Mannheim",
    "Augsburg",
    "Wiesbaden"
  ],

  /**
   * Set up a custom autocomplete dropdown on an input element.
   * @param {HTMLInputElement} inputEl - Input to attach autocomplete to
   * @param {HTMLElement} dropdownEl - Dropdown container element
   * @param {string[]} list - Array of suggestion strings
   * @param {Function} [onSelect] - Callback when an item is selected
   */
  setupAutocomplete(inputEl, dropdownEl, list, onSelect) {
    if (!inputEl || !dropdownEl) return;
    let selectedIndex = -1;

    function renderOptions(filterText = "") {
      const query = filterText.toLowerCase().trim();
      const matches = list.filter((item) => item.toLowerCase().includes(query));

      dropdownEl.innerHTML = "";
      selectedIndex = -1;

      if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gmaps-autocomplete-item--empty";
        empty.textContent = "No matching suggestions";
        dropdownEl.appendChild(empty);
      } else {
        matches.forEach((item) => {
          const div = document.createElement("div");
          div.className = "gmaps-autocomplete-item";
          div.textContent = item;
          div.addEventListener("mousedown", (e) => {
            e.preventDefault();
            inputEl.value = item;
            dropdownEl.classList.add("hidden");
            if (onSelect) onSelect(item);
          });
          dropdownEl.appendChild(div);
        });
      }
      dropdownEl.classList.remove("hidden");
    }

    inputEl.addEventListener("focus", () => {
      renderOptions(inputEl.value);
    });

    inputEl.addEventListener("input", () => {
      renderOptions(inputEl.value);
    });

    inputEl.addEventListener("keydown", (e) => {
      const items = dropdownEl.querySelectorAll(".gmaps-autocomplete-item");
      if (dropdownEl.classList.contains("hidden") || items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelection(items);
      } else if (e.key === "Enter") {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          inputEl.value = items[selectedIndex].textContent;
          dropdownEl.classList.add("hidden");
          if (onSelect) onSelect(inputEl.value);
        }
      } else if (e.key === "Escape") {
        dropdownEl.classList.add("hidden");
      }
    });

    function updateSelection(items) {
      items.forEach((it, idx) => {
        it.classList.toggle("active", idx === selectedIndex);
        if (idx === selectedIndex) {
          it.scrollIntoView({ block: "nearest" });
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        dropdownEl.classList.add("hidden");
      }
    });
  },

  /**
   * Initialize the Google Maps tab: autocomplete, keyboard nav, search button, and restore state.
   * @param {Object} opts
   * @param {HTMLInputElement} opts.keywordInput - Industry keyword input
   * @param {HTMLInputElement} opts.cityInput - City input
   * @param {HTMLElement} opts.keywordDropdown - Keyword autocomplete dropdown
   * @param {HTMLElement} opts.cityDropdown - City autocomplete dropdown
   * @param {HTMLButtonElement} opts.searchBtn - Search button
   * @param {HTMLElement} opts.toastContainer - Toast container for validation messages
   * @param {Function} opts.getI18nString - Function(key) returning translated string
   * @param {Function} opts.onSearchComplete - Callback after search tab is opened
   */
  init(opts) {
    const { keywordInput, cityInput, keywordDropdown, cityDropdown, searchBtn, toastContainer, getI18nString, onSearchComplete } = opts;

    // Set up autocomplete dropdowns
    this.setupAutocomplete(keywordInput, keywordDropdown, this.INDUSTRIES, () => {
      if (cityInput && !cityInput.value.trim()) {
        cityInput.focus();
      }
    });

    this.setupAutocomplete(cityInput, cityDropdown, this.CITIES);

    // Restore last searched values on startup
    chrome.storage.local.get(["lastGmapsKw", "lastGmapsCity"], (res) => {
      if (res.lastGmapsKw && keywordInput && !keywordInput.value) {
        keywordInput.value = res.lastGmapsKw;
      }
      if (res.lastGmapsCity && cityInput && !cityInput.value) {
        cityInput.value = res.lastGmapsCity;
      }
    });

    // Keyboard: Enter on keyword → focus city (or trigger search)
    if (keywordInput) {
      keywordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (!keywordDropdown || keywordDropdown.classList.contains("hidden"))) {
          e.preventDefault();
          if (cityInput && !cityInput.value.trim()) {
            cityInput.focus();
          } else if (searchBtn) {
            searchBtn.click();
          }
        }
      });
    }

    // Keyboard: Enter on city → trigger search
    if (cityInput) {
      cityInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (!cityDropdown || cityDropdown.classList.contains("hidden"))) {
          e.preventDefault();
          if (searchBtn) {
            searchBtn.click();
          }
        }
      });
    }

    // Search button handler
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        const kw = (keywordInput ? keywordInput.value : "").trim();
        const city = (cityInput ? cityInput.value : "").trim();

        if (!kw && !city) {
          showToast(toastContainer, getI18nString("gmapsFillBoth"), "warning");
          if (keywordInput) keywordInput.focus();
          return;
        }
        if (!kw) {
          showToast(toastContainer, getI18nString("gmapsFillIndustry"), "warning");
          if (keywordInput) keywordInput.focus();
          return;
        }
        if (!city) {
          showToast(toastContainer, getI18nString("gmapsFillCity"), "warning");
          if (cityInput) cityInput.focus();
          return;
        }

        // Save exact query to storage so the scraper doesn't rely on Google Maps URL parsing
        chrome.storage.local.set(
          { lastGmapsKw: kw, lastGmapsCity: city },
          () => {
            const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kw)}+in+${encodeURIComponent(city)}`;
            chrome.tabs.create({ url: searchUrl });
            // Auto-switch to Job Portals tab so user is ready to scrape
            if (onSearchComplete) onSearchComplete();
          },
        );
      });
    }
  },
};
