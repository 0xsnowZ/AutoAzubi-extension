/**
 * popup_onboarding.js — First-time user onboarding tutorial for AutoAzubi popup
 * Loaded before popup.js. Exposes: window.PopupOnboarding
 */
window.PopupOnboarding = {
  /**
   * Check if onboarding has been completed. If not, show the tutorial.
   */
  checkAndShow() {
    chrome.storage.local.get(["onboardingDone"], (res) => {
      if (res.onboardingDone) return;
      this._show();
    });
  },

  /**
   * Internal: Render and run the onboarding tutorial.
   * @private
   */
  _show() {
    const steps = [
      {
        target: "#navigation-btns",
        title: "Step 1 — Open a Portal",
        desc: "Click any portal button to navigate to a job search site. Search for Ausbildung listings first.",
        position: "bottom"
      },
      {
        target: ".limit-pill",
        title: "Step 2 — Set Your Limit",
        desc: "Choose how many leads to extract. Click MAX to extract all available offers.",
        position: "bottom"
      },
      {
        target: "#start-btn",
        title: "Step 3 — Start Extraction",
        desc: "Hit Start and the extension will automatically extract company details, emails, and contact info.",
        position: "top"
      }
    ];

    let currentStep = 0;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "onboarding-overlay";
    overlay.className = "onboarding-overlay";
    document.body.appendChild(overlay);

    // Create tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "onboarding-tooltip";
    tooltip.className = "onboarding-tooltip";
    document.body.appendChild(tooltip);

    function renderStep(idx) {
      const step = steps[idx];
      const targetEl = document.querySelector(step.target);
      if (!targetEl) { finishOnboarding(); return; }

      // Highlight target
      document.querySelectorAll(".onboarding-highlight").forEach(el => el.classList.remove("onboarding-highlight"));
      targetEl.classList.add("onboarding-highlight");

      // Position tooltip
      const isLast = idx === steps.length - 1;
      tooltip.innerHTML = `
        <div class="onboarding-step-indicator">${idx + 1} / ${steps.length}</div>
        <h3 class="onboarding-title">${step.title}</h3>
        <p class="onboarding-desc">${step.desc}</p>
        <div class="onboarding-actions">
          <button class="onboarding-skip" id="onboarding-skip">Skip</button>
          <button class="onboarding-next" id="onboarding-next">${isLast ? "Got it!" : "Next →"}</button>
        </div>
      `;

      // Position near target — use rAF so tooltip has been laid out
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

      requestAnimationFrame(() => {
        const rect = targetEl.getBoundingClientRect();
        const tooltipH = tooltip.offsetHeight;
        const tooltipW = tooltip.offsetWidth;
        const popupW = document.documentElement.clientWidth;
        const popupH = document.documentElement.clientHeight;

        let top;
        if (step.position === "bottom") {
          top = rect.bottom + 10;
          // If tooltip would go below viewport, show above instead
          if (top + tooltipH > popupH - 10) {
            top = rect.top - tooltipH - 10;
          }
        } else {
          top = rect.top - tooltipH - 10;
          // If tooltip would go above viewport, show below instead
          if (top < 10) {
            top = rect.bottom + 10;
          }
        }
        // Final clamp
        top = Math.max(10, Math.min(top, popupH - tooltipH - 10));

        const left = Math.max(10, Math.min((popupW - tooltipW) / 2, popupW - tooltipW - 10));
        tooltip.style.top = top + "px";
        tooltip.style.left = left + "px";
        tooltip.style.transform = "none";
      });

      document.getElementById("onboarding-skip").onclick = finishOnboarding;
      document.getElementById("onboarding-next").onclick = () => {
        currentStep++;
        if (currentStep >= steps.length) {
          finishOnboarding();
        } else {
          renderStep(currentStep);
        }
      };
    }

    function finishOnboarding() {
      document.querySelectorAll(".onboarding-highlight").forEach(el => el.classList.remove("onboarding-highlight"));
      overlay.remove();
      tooltip.remove();
      chrome.storage.local.set({ onboardingDone: true });
    }

    // Small delay so popup has rendered
    setTimeout(() => renderStep(0), 300);
  },
};
