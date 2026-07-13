/**
 * Job Scraper Content Script V2.2
 * Added: Persistence, improved pause/resume, and optimized filtering.
 */

let isScraping = false;
let isPaused = false;
let scrapedData = [];
let targetLimit = 0;
let filtersApplied = false;
let currentCardIndex = 0;

// Audio setup
const captchaSound = new Audio(chrome.runtime.getURL('captcha.mp3'));
const finishedSound = new Audio(chrome.runtime.getURL('finished.mp3'));

// Settings Cache
let settings = {
    notifyCaptcha: true,
    notifyFinish: true
};

// Initialize State from Storage
chrome.storage.local.get(['scrapedData', 'isScraping', 'isPaused', 'targetLimit', 'filtersApplied', 'currentCardIndex', 'notifyCaptcha', 'notifyFinish'], (result) => {
    if (result.scrapedData) scrapedData = result.scrapedData;
    if (result.isScraping !== undefined) isScraping = result.isScraping;
    if (result.isPaused !== undefined) isPaused = result.isPaused;
    if (result.targetLimit) targetLimit = result.targetLimit;
    if (result.filtersApplied !== undefined) filtersApplied = result.filtersApplied;
    if (result.currentCardIndex !== undefined) currentCardIndex = result.currentCardIndex;

    settings.notifyCaptcha = result.notifyCaptcha !== false;
    settings.notifyFinish = result.notifyFinish !== false;

    console.log(`State recovered: ${scrapedData.length} records, isScraping: ${isScraping}, isPaused: ${isPaused}`);

    if (isScraping && !isPaused) {
        startScraping();
    }
});

// Update Storage helper
function updateStorage() {
    chrome.storage.local.set({
        scrapedData,
        isScraping,
        isPaused,
        targetLimit,
        filtersApplied,
        currentCardIndex
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.settings) {
        settings = request.settings;
        chrome.storage.local.set(settings);
    }

    switch (request.action) {
        case 'start':
            isScraping = true;
            isPaused = false;
            if (request.reset) {
                scrapedData = [];
                filtersApplied = false;
                currentCardIndex = 0;
            }
            targetLimit = request.limit || 50;
            updateStorage();
            startScraping();
            sendResponse({ status: 'started' });
            break;
        case 'pause':
            isPaused = true;
            updateStorage();
            sendResponse({ status: 'paused' });
            break;
        case 'resume':
            isPaused = false;
            updateStorage();
            if (isScraping) startScraping();
            sendResponse({ status: 'resumed' });
            break;
        case 'stop':
            isScraping = false;
            isPaused = false;
            updateStorage();
            sendResponse({ status: 'stopped' });
            break;
        case 'reset':
            isScraping = false;
            isPaused = false;
            scrapedData = [];
            filtersApplied = false;
            currentCardIndex = 0;
            updateStorage();
            sendResponse({ status: 'reset' });
            break;
        case 'getData':
            sendResponse({ data: scrapedData });
            break;
        case 'getInitialInfo':
            getInitialInfo().then(total => sendResponse({
                total,
                scrapedCount: scrapedData.length,
                isScraping,
                isPaused
            }));
            return true;
        case 'countResults':
            countResults().then(total => {
                filtersApplied = true;
                updateStorage();
                sendResponse({ total });
            });
            return true;
    }
});

async function getInitialInfo() {
    const total = document.getElementById('suchergebnis-h1-anzeige');
    const totalText = total ? total.innerText.replace(/[^0-9]/g, '') : '0';
    return parseInt(totalText) || 0;
}

async function countResults() {
    console.log("Applying filters before counting...");
    await applyFilter();
    await sleep(800);
    return await getInitialInfo();
}

async function startScraping() {
    try {
        await _startScraping();
    } catch (err) {
        console.error('Scraping error:', err);
        isScraping = false;
        isPaused = false;
        updateStorage();
        chrome.runtime.sendMessage({ action: 'error', message: String(err) });
    }
}

async function _startScraping() {
    // 1. Initial Filtering (only if not already applied)
    if (!filtersApplied) {
        await applyFilter();
        filtersApplied = true;
        updateStorage();
    }

    // 2. Select List View (if tab exists — removed in newer site versions)
    const viewTab = document.getElementById('ansicht-auswahl-tabbar-item-1');
    if (viewTab) {
        console.log("Switching to list view...");
        viewTab.click();
        await sleep(800);
    }

    while (isScraping) {
        if (isPaused) {
            console.log("Scraping paused...");
            break; // Exit loop, resume will re-call startScraping
        }

        let cards = document.querySelectorAll('[id^="ergebnisliste-item-"]');

        if (scrapedData.length < targetLimit) {
            for (let i = currentCardIndex; i < cards.length; i++) {
                if (!isScraping || isPaused) break;
                if (scrapedData.length >= targetLimit) break;

                const card = cards[i];
                card.click();

                await sleep(1000);

                // Click "Info zur Bewerbung" to request contact details
                const bewerbungBtn = document.getElementById('detailansicht-zur-bewerbung');
                if (bewerbungBtn) {
                    console.log("Clicking 'Info zur Bewerbung'...");
                    bewerbungBtn.click();
                    await sleep(800);
                }

                // Handle captcha (appears after requesting contact info)
                if (await handleCaptcha()) {
                    // captcha was solved, wait for contact details to load
                    await sleep(1000);
                }

                // Wait for contact details to appear (up to 5 seconds)
                let waitAttempts = 0;
                while (!document.getElementById('detail-bewerbung-mail') && !document.getElementById('detail-bewerbung-adresse') && waitAttempts < 10) {
                    await sleep(500);
                    waitAttempts++;
                }

                const info = extractInfo();
                if (info) {
                    const linkElement = document.getElementById(`agdarstellung-websitelink-${i}`);
                    info.link = linkElement ? linkElement.href : '';

                    scrapedData.push(info);
                    updateStorage();
                    console.log(`Extracted (${scrapedData.length}/${targetLimit}):`, info);
                    chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length, currentTitle: info.company });
                } else {
                    console.log(`Card ${i}: No email found, skipping.`);
                }

                await sleep(300);
                currentCardIndex = i + 1;
                updateStorage();
            }
        }

        if (scrapedData.length >= targetLimit) {
            console.log("Target limit reached.");
            break;
        }

        const loadMoreBtn = document.getElementById('ergebnisliste-ladeweitere-button');
        if (loadMoreBtn && isScraping && !isPaused) {
            console.log("Loading more results...");
            loadMoreBtn.click();
            await sleep(1500);
        } else if (!loadMoreBtn) {
            console.log("No more results available.");
            break;
        }
    }

    // Only set finished if we actually hit the limit or ran out of results
    if (isScraping && !isPaused && (scrapedData.length >= targetLimit || !document.getElementById('ergebnisliste-ladeweitere-button'))) {
        if (settings.notifyFinish) finishedSound.play();
        isScraping = false;
        isPaused = false;
        updateStorage();
        chrome.runtime.sendMessage({ action: 'finished', count: scrapedData.length });
    }
}

async function applyFilter() {
    console.log("Checking filter state...");
    const filterToggle = document.getElementById('filter-toggle');
    if (filterToggle) {
        if (filterToggle.getAttribute('aria-expanded') !== 'true') {
            filterToggle.click();
            await sleep(400);
        }

        const extFilter = document.querySelector('input[type="checkbox"][id*="externe"]');
        if (extFilter && !extFilter.checked) {
            console.log("Enabling 'no external offers' filter...");
            extFilter.click();
            await sleep(500);
        }

        const applyBtn = document.getElementById('footer-button-modales-slide-in-filter');
        if (applyBtn) {
            console.log("Clicking apply filters button...");
            applyBtn.click();
            await sleep(800);
        }
    }
}

async function handleCaptcha() {
    let captchaForm = document.getElementById('captchaForm') || document.querySelector('form[id*="captcha"]') || document.getElementById('kontaktdaten-captcha-input') || document.querySelector('[id*="kontaktdaten-captcha"]');
    if (captchaForm) {
        console.log("Captcha detected!");
        chrome.runtime.sendMessage({ action: 'progress', status: 'waiting_captcha' });

        // Setup repeating sound every 4 seconds
        let soundInterval = null;
        if (settings.notifyCaptcha) {
            captchaSound.play();
            soundInterval = setInterval(() => {
                const stillExists = document.getElementById('captchaForm') || document.querySelector('form[id*="captcha"]') || document.getElementById('kontaktdaten-captcha-input') || document.querySelector('[id*="kontaktdaten-captcha"]');
                if (stillExists && isScraping) {
                    captchaSound.play();
                } else {
                    clearInterval(soundInterval);
                }
            }, 4000);
        }

        const notice = document.createElement('div');
        notice.id = 'scraper-notice';
        notice.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #161a23;
            color: #f8fafc;
            padding: 0;
            border-radius: 14px;
            z-index: 10000;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            font-family: 'Inter', 'Segoe UI', sans-serif;
            max-width: 340px;
            width: 340px;
            border: 1px solid #2d333f;
            border-top: 3px solid #f59e0b;
            overflow: hidden;
            animation: scraperNoticeIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        `;

        // Add keyframes for entrance animation
        if (!document.getElementById('scraper-notice-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'scraper-notice-styles';
            styleSheet.textContent = `
                @keyframes scraperNoticeIn {
                    from { opacity: 0; transform: translateY(-16px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes scraperPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                #scraper-notice .notice-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: rgba(245, 158, 11, 0.12);
                    border: 1px solid rgba(245, 158, 11, 0.25);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    color: #f59e0b;
                    animation: scraperPulse 2s ease-in-out infinite;
                }
                #scraper-notice .notice-header {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 20px 20px 0;
                }
                #scraper-notice .notice-header h3 {
                    margin: 0;
                    font-family: 'Outfit', 'Segoe UI', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    color: #f8fafc;
                    letter-spacing: -0.3px;
                }
                #scraper-notice .notice-body {
                    padding: 10px 20px 20px;
                    margin-left: 58px;
                }
                #scraper-notice .notice-body p {
                    margin: 0;
                    font-size: 13px;
                    color: #94a3b8;
                    line-height: 1.5;
                }
                #scraper-notice .notice-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 12px;
                    padding: 5px 10px;
                    background: rgba(245, 158, 11, 0.08);
                    border: 1px solid rgba(245, 158, 11, 0.15);
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #f59e0b;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                #scraper-notice .notice-badge .dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #f59e0b;
                    animation: scraperPulse 1.5s ease-in-out infinite;
                }
            `;
            document.head.appendChild(styleSheet);
        }

        notice.innerHTML = `
            <div class="notice-header">
                <div class="notice-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                </div>
                <h3>Captcha Detected</h3>
            </div>
            <div class="notice-body">
                <p>A captcha has appeared. Please solve it manually to continue scraping.</p>
                <div class="notice-badge">
                    <span class="dot"></span>
                    Waiting for solve
                </div>
            </div>
        `;
        document.body.appendChild(notice);

        while (isScraping && (document.getElementById('captchaForm') || document.querySelector('form[id*="captcha"]') || document.getElementById('kontaktdaten-captcha-input') || document.querySelector('[id*="kontaktdaten-captcha"]'))) {
            await sleep(1000);
        }

        if (soundInterval) clearInterval(soundInterval);
        if (notice) notice.remove();
        return true;
    }
    return false;
}

function extractInfo() {
    const addressParent = document.getElementById('detail-bewerbung-adresse');
    const mailElement = document.getElementById('detail-bewerbung-mail');
    const phoneElement = document.getElementById('detail-bewerbung-telefon-Telefon');
    const descContainer = document.getElementById('detail-beschreibung-text-container');

    // Requirement 2: Skip data without email
    if (!mailElement) {
        console.log("No email ID 'detail-bewerbung-mail' found, skipping...");
        return null;
    }

    let company = '';
    let contact = '';
    let address = '';
    let email = mailElement.innerText.trim();
    let phone = '';

    // Requirement 1: Extract phone from href
    if (phoneElement) {
        // Usually href="tel:+49..."
        phone = phoneElement.getAttribute('href') ? phoneElement.getAttribute('href').replace('tel:', '').trim() : phoneElement.innerText.trim();
    }

    if (addressParent) {
        const html = addressParent.innerHTML;
        const lines = html.split(/<br\s*\/?>/i).map(l => l.trim().replace(/<.*?>/g, ''));
        company = lines[0] || '';
        contact = lines[1] || '';
        address = lines.slice(2).join(', ');
    }

    // If no email found in regular field, search in description
    if (!email && descContainer) {
        // Search for mailto: links
        const mailtoMatch = descContainer.innerHTML.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})/i);
        if (mailtoMatch) {
            email = mailtoMatch[1];
        } else {
            // Broad regex search as fallback
            const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})/g;
            const textMatch = descContainer.innerText.match(emailRegex);
            if (textMatch) email = textMatch[0];
        }
    }

    // Return object if we found email (already enforced above, but returning consistent object)
    if (email) {
        return { company, contact, address, email, phone };
    }

    return null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
