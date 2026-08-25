// aubiplus_script.js
let isScraping = false;
let isPaused = false;
let targetLimit = 50;

const PORTAL_SOURCE = 'Aubi-Plus.de';

const finishedSound = new Audio(chrome.runtime.getURL('finished.mp3'));
let settings = { notifyFinish: true };

// waitForElement() provided by utils.js (MutationObserver-based, loaded first via manifest.json)

async function applyFilters() {
    // Check and wait for the filter dropdown
    const dropdownBtn = await waitForElement('.btn-filter', 5000);
    if (dropdownBtn) {
        dropdownBtn.click();

        // The checkbox is hidden (d-none), so we click its label instead
        const ausbildungCheckbox = await waitForElement('#fTyp_ausbildung', 3000);
        const ausbildungLabel = document.querySelector('label[for="fTyp_ausbildung"]');
        if (ausbildungCheckbox && ausbildungLabel) {
            if (!ausbildungCheckbox.checked) {
                ausbildungLabel.click();
                await sleep(800);
            }
        }
    }
}

async function handleSearchPage(limit = 50) {
    if (isScraping) return;
    isScraping = true;
    isPaused = false;
    targetLimit = limit;

    await applyFilters();

    // Give it a moment to ensure cards are loaded
    await sleep(1000);

    let currentData = await new Promise(r => {
        chrome.storage.local.get(['scrapedData'], res => r(res.scrapedData || []));
    });

    // Build URL dedup set from existing data to avoid duplicates on re-runs
    const seenUrls = new Set(currentData.map(d => d.link).filter(Boolean));

    let keepGoing = true;
    let currentPage = 1;

    let docToSearch = document;

    while (keepGoing && currentData.filter(d => d.source === PORTAL_SOURCE).length < limit) {
        if (!isScraping) break;

        while (isPaused) {
            await sleep(500);
            if (!isScraping) break;
        }
        if (!isScraping) break;

        if (currentPage > 1) {
            // Recognize Aubi-Plus pagination button
            let nextBtn = docToSearch.querySelector('li.page-item a[rel="next"]') ||
                docToSearch.querySelector('a.page-link[aria-label*="Next"]') ||
                docToSearch.querySelector('a.page-link[aria-label*="Weiter"]') ||
                Array.from(docToSearch.querySelectorAll('ul.pagination a.page-link')).find(a => (a.textContent || '').includes('»') || (a.textContent || '').includes('Weiter') || (a.textContent || '').includes('Nächste'));

            if (!nextBtn || !nextBtn.href) {
                console.log("No next page button found. Pagination ends.");
                break; // No more cards/pages found
            }

            try {
                // Because DOMParser resolves relative URLs differently, we might need absolute URL
                let nextUrl = nextBtn.href;
                if (nextUrl.startsWith('chrome-extension')) {
                    nextUrl = new URL(nextBtn.getAttribute('href'), 'https://www.aubi-plus.de').href;
                }

                console.log("Fetching next page: ", nextUrl);
                const res = await fetchWithRetry(nextUrl);
                const text = await res.text();
                const parser = new DOMParser();
                docToSearch = parser.parseFromString(text, 'text/html');
            } catch (e) {
                console.error("Error fetching next page", e);
                break;
            }
        }

        const cards = docToSearch.querySelectorAll('.my-3.text-primary-dark.overflow-hidden.rounded-3');
        if (cards.length === 0) {
            console.log("No cards found on this page.");
            break; // No more cards found on this page
        }

        // Collect all card URLs first, then process in parallel batches
        const cardUrls = [];
        for (let i = 0; i < cards.length; i++) {
            let linkElement = cards[i].querySelector('a.stretched-link') || cards[i].querySelector('h2 a') || cards[i].querySelector('a:not([href="#"])');
            if (cards[i].tagName === 'A') linkElement = cards[i];
            if (!linkElement) continue;

            let href = linkElement.href || linkElement.getAttribute('href');
            if (!href) continue;

            // Resolving URLs parsed by DOMParser from text
            if (href.startsWith('chrome-extension://')) {
                href = new URL(linkElement.getAttribute('href'), 'https://www.aubi-plus.de').href;
            } else if (href.startsWith('/')) {
                href = 'https://www.aubi-plus.de' + href;
            }

            if (!seenUrls.has(href)) {
                cardUrls.push(href);
            }
        }

        // Process in parallel batches of 5 for ~5x speed improvement
        const BATCH_SIZE = 5;
        for (let i = 0; i < cardUrls.length; i += BATCH_SIZE) {
            while (isPaused) {
                await sleep(500);
                if (!isScraping) break;
            }
            if (!isScraping) break;
            if (currentData.filter(d => d.source === PORTAL_SOURCE).length >= limit) break;

            const batch = cardUrls.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(async (href) => {
                try {
                    const response = await fetchWithRetry(href);
                    const text = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');

                    // Aubi-Plus encodes script type as "application&#x2F;ld&#x2B;json"
                    // which breaks querySelector, so extract hiringOrganization.name via regex
                    const companyName = (() => {
                        const orgMatch = text.match(/"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
                        if (orgMatch) return orgMatch[1].replace(/\\u[\da-fA-F]{4}/g, m => String.fromCharCode(parseInt(m.slice(2), 16)));
                        return extractCompanyFromDoc(doc);
                    })() ||
                        (() => {
                            const el = doc.querySelector('.fs-6.mb-0.lh-1');
                            return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
                        })();

                    const address = (() => {
                        // Regex extraction from JSON-LD (same encoding issue as company)
                        const street = (text.match(/"streetAddress"\s*:\s*"([^"]+)"/) || [])[1] || '';
                        const postal = (text.match(/"postalCode"\s*:\s*"([^"]+)"/) || [])[1] || '';
                        const locality = (text.match(/"addressLocality"\s*:\s*"([^"]+)"/) || [])[1] || '';
                        if (street || postal || locality) {
                            const decoded = [street, postal, locality].filter(Boolean).join(', ')
                                .replace(/\\u[\da-fA-F]{4}/g, m => String.fromCharCode(parseInt(m.slice(2), 16)));
                            return decoded;
                        }
                        return extractAddressFromDoc(doc);
                    })() ||
                        (() => {
                            const icons = doc.querySelectorAll('.fa-location-dot');
                            for (let icon of icons) {
                                if (icon.nextElementSibling && icon.nextElementSibling.tagName === 'SPAN') {
                                    return icon.nextElementSibling.textContent.trim();
                                }
                            }
                            return '';
                        })();

                    const email = extractEmailFromHtml(text);
                    const phone = (() => {
                            const el = doc.querySelector('.phoneNumber');
                            return el ? el.textContent.trim() : '';
                        })() || extractPhoneFromHtml(text);

                    // Extract Ansprechpartner: "Frau Claudia Pelka" in <strong> near mail-protect
                    const contact = (() => {
                        const contactMatch = text.match(/<strong>\s*((?:Frau|Herr)\s+[^<]+?)\s*<\/strong>/i);
                        if (contactMatch) return contactMatch[1].trim();
                        // Fallback: alt attribute of ansprechpartner image
                        const altMatch = text.match(/ansprechpartner[^>]*alt="([^"]+)"/i);
                        if (altMatch) return altMatch[1].trim();
                        return '';
                    })();

                    return { href, companyName, address, email, phone, contact };
                } catch (err) {
                    console.error("Error fetching details", err);
                    return null;
                }
            }));

            // Process batch results
            for (const result of results) {
                if (result.status !== 'fulfilled' || !result.value) continue;
                if (currentData.filter(d => d.source === PORTAL_SOURCE).length >= limit) break;

                const { href, companyName, address, email, phone, contact } = result.value;

                if (!email) {
                    chrome.runtime.sendMessage({ action: 'progress', count: currentData.length, portalCount: currentData.filter(d => d.source === PORTAL_SOURCE).length, currentTitle: `[Aubi-Plus] Checking: ${companyName || 'Unknown'} (no email)` });
                    continue;
                }

                // Email dedup: skip if this email was already scraped
                const isDuplicate = currentData.some(d => d.email.toLowerCase() === email.toLowerCase());
                if (isDuplicate) {
                    console.log("[AubiPlus] Duplicate email, skipping:", email);
                    continue;
                }

                seenUrls.add(href);
                currentData.push({
                    company: companyName,
                    email: email,
                    address: address,
                    contact: contact || '',
                    anrede: '',
                    link: href,
                    phone: phone,
                    source: PORTAL_SOURCE,
                    extractedAt: new Date().toISOString()
                });

                chrome.runtime.sendMessage({ action: 'progress', count: currentData.length, portalCount: currentData.filter(d => d.source === PORTAL_SOURCE).length, currentTitle: companyName });
            }

            // Save once per batch instead of per-item
            await new Promise(r => chrome.storage.local.set({ scrapedData: currentData }, r));

            // Anti-bot delay between batches
            await sleep(200);
        }

        currentPage++;
    }

    if (isScraping) {
        if (settings.notifyFinish) finishedSound.play();
        const portalCount = currentData.filter(d => d.source === PORTAL_SOURCE).length;
        chrome.runtime.sendMessage({ action: 'finished', count: currentData.length, portalCount });
    }
    isScraping = false;
    isPaused = false;
    chrome.storage.local.set({ isScraping: false, isPaused: false });
}

// Wrap with error propagation
const _handleSearchPage = handleSearchPage;
handleSearchPage = async function(limit) {
    try {
        await _handleSearchPage(limit);
    } catch (err) {
        console.error('[AubiPlus] Scraping error:', err);
        isScraping = false;
        isPaused = false;
        chrome.storage.local.set({ isScraping: false, isPaused: false });
        chrome.runtime.sendMessage({ action: 'error', message: String(err) });
    }
};

async function countResults() {
    await applyFilters();
    const titleEl = await waitForElement('.mb-0.pe-5.pe-sm-0.text-md-center.suchmaschine-title', 5000) ||
        await waitForElement('.suchmaschine-title', 2000);
    if (titleEl) {
        const dangerSpan = titleEl.querySelector('.text-danger');
        if (dangerSpan) {
            const numText = dangerSpan.innerText.replace(/\D/g, '');
            const num = parseInt(numText, 10);
            return isNaN(num) ? 0 : num;
        }
    }
    return 0;
}

// ─── Message Listener ─────────────────────────────────────────────────────────
// Uses shared createScraperMessageHandler from utils.js to reduce boilerplate.
// Default handlers cover: pause, resume, stop, getInitialInfo, getData.
chrome.runtime.onMessage.addListener(
    createScraperMessageHandler(
        () => ({ isScraping, isPaused }),
        {
            onSettings: (s) => { settings = s; },
            onUpdateLimit: (limit) => { targetLimit = limit; },
            onPause: () => { isPaused = true; },
            onResume: () => { isPaused = false; },
            onStop: () => { isScraping = false; isPaused = false; },
            start: (request, sendResponse) => {
                const limit = request.limit || 50;
                if (!isScraping) handleSearchPage(limit);
                sendResponse({ status: 'started' });
            },
            reset: (request, sendResponse) => {
                isScraping = false;
                isPaused = false;
                chrome.storage.local.set({ scrapedData: [] }, () => sendResponse({ status: 'reset' }));
            },
            countResults: (request, sendResponse) => {
                countResults().then(total => sendResponse({ total }));
            },
        }
    )
);
