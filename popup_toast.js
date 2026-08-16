/**
 * popup_toast.js — Toast notification system for AutoAzubi popup
 * Loaded before popup.js. Exposes: window.showToast(container, message, type, duration)
 */

const _toastIcons = {
  success:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  error:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
  warning:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
};

/**
 * Show a toast notification in the given container element.
 * @param {HTMLElement} container - The toast container element
 * @param {string} message - Toast message text
 * @param {string} type - Toast type: 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Auto-dismiss time in ms (default: 4000)
 */
window.showToast = function showToast(
  container,
  message,
  type = "info",
  duration = 4000,
) {
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Build toast safely — use textContent for the message to prevent XSS
  const iconDiv = document.createElement("div");
  iconDiv.className = "toast-icon";
  iconDiv.innerHTML = _toastIcons[type] || _toastIcons.info;

  const msgSpan = document.createElement("span");
  msgSpan.className = "toast-msg";
  msgSpan.textContent = message;

  const progressDiv = document.createElement("div");
  progressDiv.className = "toast-progress";
  progressDiv.innerHTML = '<div class="toast-progress-bar"></div>';

  toast.appendChild(iconDiv);
  toast.appendChild(msgSpan);
  toast.appendChild(progressDiv);
  container.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add("toast-show"));

  // Auto-dismiss with progress bar
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
};
