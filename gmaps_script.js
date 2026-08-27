console.log("GMaps script injected for DasÖrtliche scraping overlay");

const PORTAL_SOURCE = 'Google Maps';
const GMAPS_SESSION_KEY = 'gmapsScrapingSession';

let isScraping = false;
let isPaused = false;
let scrapedData = [];
let targetLimit = 50;
let currentPageUrl = null;
let processedHits = 0;        // tracks total hits checked across all pages
let currentHitStartIndex = 0; // tracks hit index within the current page for pause/resume

// Domain crawl cache: skip websites we already checked for email
const crawledDomains = new Map(); // domain -> email or ''

// Helper function to wait
// sleep, sleepWithThrottle, waitForElement, extractEmailFromHtml, extractPhoneFromHtml
// are provided by utils.js (loaded first via manifest.json)

const finishedSound = new Audio(chrome.runtime.getURL('finished.mp3'));

// Settings Cache
let settings = {
    notifyCaptcha: false,
    notifyFinish: true
};

// ─── Session Persistence ─────────────────────────────────────────────────────────

function saveGmapsSession() {
    // Save session metadata separately from scrapedData to reduce serialization cost
    chrome.storage.local.set({ scrapedData });
    chrome.storage.local.set({
        [GMAPS_SESSION_KEY]: {
            currentPageUrl,
            currentHitStartIndex,
            processedHits,
            targetLimit,
            isScraping,
            isPaused
        }
    });
}

function clearGmapsSession() {
    chrome.storage.local.remove(GMAPS_SESSION_KEY);
}

// Initialize State from Storage — auto-resume if a session was active
chrome.storage.local.get(['scrapedData', GMAPS_SESSION_KEY, 'notifyCaptcha', 'notifyFinish'], (result) => {
    if (result.scrapedData) scrapedData = result.scrapedData;
    settings.notifyCaptcha = result.notifyCaptcha === true;
    settings.notifyFinish = result.notifyFinish !== false;

    const session = result[GMAPS_SESSION_KEY];
    if (session) {
        currentPageUrl = session.currentPageUrl;
        currentHitStartIndex = session.currentHitStartIndex || 0;
        processedHits = session.processedHits || 0;
        targetLimit = session.targetLimit || 50;
        isScraping = session.isScraping || false;
        isPaused = session.isPaused || false;

        if (isScraping && !isPaused) {
            console.log(`[GMaps] Auto-resuming session: ${scrapedData.filter(d => d.source === PORTAL_SOURCE).length} portal entries, page ${currentPageUrl}`);
            startScraping();
        }
    }
});

function extractKwAndCity() {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('query') || '';

    let keyword = '';
    let city = '';

    const inIndex = query.toLowerCase().lastIndexOf(' in ');
    if (inIndex !== -1) {
        keyword = query.substring(0, inIndex).trim();
        city = query.substring(inIndex + 4).trim();
    } else {
        const parts = window.location.pathname.split('/');
        const searchIndex = parts.indexOf('search');
        if (searchIndex !== -1 && parts[searchIndex + 1]) {
            const decodedSearch = decodeURIComponent(parts[searchIndex + 1].replace(/\+/g, ' '));
            const pathInIndex = decodedSearch.toLowerCase().lastIndexOf(' in ');
            if (pathInIndex !== -1) {
                keyword = decodedSearch.substring(0, pathInIndex).trim();
                city = decodedSearch.substring(pathInIndex + 4).trim();
            }
        }
    }
    return { keyword, city };
}

async function getDasOertlicheTotal() {
    const { keyword, city } = extractKwAndCity();
    if (!keyword || !city) return '?';

    let searchUrl = `https://www.dasoertliche.de/?kw=${encodeURIComponent(keyword)}&ci=${encodeURIComponent(city)}&form_name=search_nat`;
    try {
        let response = await chrome.runtime.sendMessage({ action: 'fetch_text', url: searchUrl });
        if (response && response.success) {
            let parser = new DOMParser();
            let doc = parser.parseFromString(response.text, 'text/html');

            // Handle Ortsauswahl (City Selection)
            const ortsLink = doc.querySelector('a[href*="zvo_ok=1"]');
            if (ortsLink && !doc.querySelector('.sttrefferanz')) {
                let redirectUrl = ortsLink.getAttribute('href').replace(/&amp;/g, '&');
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = 'https://www.dasoertliche.de' + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
                }
                response = await chrome.runtime.sendMessage({ action: 'fetch_text', url: redirectUrl });
                if (response && response.success) {
                    doc = parser.parseFromString(response.text, 'text/html');
                }
            }

            const trefferanz = doc.querySelector('.sttrefferanz');
            if (trefferanz) {
                const text = trefferanz.textContent;
                const matches = text.match(/[\d.]+/);
                if (matches) {
                    const numberStr = matches[0].replace(/\./g, '');
                    return parseInt(numberStr) || '?';
                }
            }
            return '0';
        }
    } catch (e) {
        console.error(e);
    }
    return '?';
}

// extractEmailFromHtml is provided by utils.js (loaded first via manifest.json)

/**
 * Extract website URL from DasÖrtliche detail page HTML
 */
function extractWebsiteUrl(rawHtml) {
    if (!rawHtml) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Strategy 1: Look for .hitlnk_www or .www links (DasÖrtliche website links)
    const wwwLink = doc.querySelector('.hitlnk_www, .hitlnk_homepage, a.hitlnk_www_detail');
    if (wwwLink) {
        const href = wwwLink.getAttribute('href') || wwwLink.getAttribute('data-href') || '';
        if (href && !href.includes('dasoertliche.de')) return href;
    }

    // Strategy 2: Look for links with "Website" or "Webseite" text
    const allLinks = doc.querySelectorAll('a');
    for (const link of allLinks) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.getAttribute('href') || '';
        if ((text.includes('website') || text.includes('webseite') || text.includes('homepage') || text.includes('www'))
            && href.startsWith('http') && !href.includes('dasoertliche.de')) {
            return href;
        }
    }

    // Strategy 3: Regex on raw HTML for external URLs in specific containers
    const urlMatch = rawHtml.match(/class="[^"]*(?:www|homepage|website)[^"]*"[^>]*href="(https?:\/\/(?!www\.dasoertliche\.de)[^"]+)"/i);
    if (urlMatch) return urlMatch[1];

    // Strategy 4: Look for external links in the detail content area
    const detailContent = doc.querySelector('.detail, .detailblock, #detail');
    if (detailContent) {
        const extLink = detailContent.querySelector('a[href^="http"]:not([href*="dasoertliche.de"])');
        if (extLink) return extLink.getAttribute('href');
    }

    return '';
}

/**
 * Crawl a company's website to find email from Impressum/Kontakt pages
 * German law requires Impressum with contact email
 */
async function crawlWebsiteForEmail(websiteUrl) {
    if (!websiteUrl) return '';

    try {
        // Normalize URL
        let baseUrl = websiteUrl.replace(/\/+$/, '');

        // Step 1: Always check the homepage first (email often in footer)
        const homeResp = await chrome.runtime.sendMessage({ action: 'fetch_text_utf8', url: baseUrl + '/' });
        let contactPaths = ['/impressum', '/kontakt', '/imprint'];

        if (homeResp && homeResp.success && homeResp.text) {
            const homeEmail = extractEmailFromHtml(homeResp.text);
            if (homeEmail) {
                console.log(`Found email on homepage: ${homeEmail}`);
                return homeEmail;
            }

            // Step 2: If no email, dynamically find the exact Impressum/Kontakt link from the homepage HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(homeResp.text, 'text/html');
            const links = Array.from(doc.querySelectorAll('a'));
            
            const dynamicContactLink = links.find(a => {
                const text = a.textContent.toLowerCase();
                const href = a.getAttribute('href') || '';
                return text.includes('impressum') || text.includes('kontakt') || href.includes('impressum') || href.includes('kontakt');
            });

            if (dynamicContactLink) {
                let dynamicHref = dynamicContactLink.getAttribute('href');
                if (dynamicHref && !dynamicHref.startsWith('http') && !dynamicHref.startsWith('#') && !dynamicHref.startsWith('mailto:')) {
                    dynamicHref = dynamicHref.startsWith('/') ? dynamicHref : '/' + dynamicHref;
                    // Prioritize the dynamically found path
                    contactPaths.unshift(dynamicHref);
                } else if (dynamicHref && dynamicHref.startsWith('http')) {
                    // It's an absolute URL (e.g. on a subdomain)
                    contactPaths.unshift(dynamicHref);
                }
            }
        }

        // De-duplicate contact paths to prevent unnecessary fetches
        contactPaths = [...new Set(contactPaths)];

        // Step 3: Try the paths
        for (const path of contactPaths) {
            if (!isScraping) break;

            // Handle absolute URLs dynamically found vs relative paths
            const contactUrl = path.startsWith('http') ? path : baseUrl + path;
            console.log(`Trying contact page: ${contactUrl}`);

            const resp = await chrome.runtime.sendMessage({ action: 'fetch_text_utf8', url: contactUrl });
            if (resp && resp.success && resp.text) {
                const email = extractEmailFromHtml(resp.text);
                if (email) {
                    console.log(`Found email on ${contactUrl}: ${email}`);
                    return email;
                }
            }
        }

    } catch (e) {
        console.error('Error crawling website for email:', e);
    }

    return '';
}

/**
 * Timeout-guarded wrapper around crawlWebsiteForEmail.
 * Prevents slow/unresponsive websites from blocking the entire scrape.
 * Returns '' if the crawl exceeds the time limit.
 */
async function crawlWebsiteForEmailWithTimeout(websiteUrl, timeoutMs = 6000) {
    // Check domain cache first — avoid re-crawling the same site
    try {
        const domain = new URL(websiteUrl).hostname;
        if (crawledDomains.has(domain)) {
            return crawledDomains.get(domain);
        }
        const email = await Promise.race([
            crawlWebsiteForEmail(websiteUrl),
            new Promise(resolve => setTimeout(() => resolve(''), timeoutMs))
        ]);
        crawledDomains.set(domain, email);
        return email;
    } catch (e) {
        return '';
    }
}

async function startScraping() {
    try {
        await _startScraping();
    } catch (err) {
        console.error('[GMaps] Scraping error:', err);
        isScraping = false;
        isPaused = false;
        clearGmapsSession();
        chrome.runtime.sendMessage({ action: 'error', message: String(err) });
    }
}

async function _startScraping() {
    let { keyword, city } = extractKwAndCity();

    // Prioritize the exact keywords typed by the user in the extension popup.
    // Google Maps aggressively translates "IT in Berlin" to "Information Technology in Berlin",
    // which breaks DasÖrtliche's search engine.
    const stored = await chrome.storage.local.get(['lastGmapsKw', 'lastGmapsCity']);
    if (stored.lastGmapsKw && stored.lastGmapsCity) {
        keyword = stored.lastGmapsKw;
        city = stored.lastGmapsCity;
    }

    if (!keyword || !city) {
        chrome.runtime.sendMessage({ action: 'error', message: 'Could not detect keyword and city. Please search using the popup\'s Google Maps tab.' });
        isScraping = false;
        return;
    }

    console.log(`Starting background scrape for: Keyword=${keyword}, City=${city}`);

    if (!currentPageUrl) {
        currentPageUrl = `https://www.dasoertliche.de/?kw=${encodeURIComponent(keyword)}&ci=${encodeURIComponent(city)}&form_name=search_nat`;
    }

    let portalCount = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;

    while (currentPageUrl && isScraping && portalCount < targetLimit) {
        while (isPaused) {
            await sleep(300);
            if (!isScraping) break;
        }
        if (!isScraping) break;

        console.log(`[DasÖrtliche] Fetching list page: ` + currentPageUrl);

        const response = await chrome.runtime.sendMessage({ action: 'fetch_text', url: currentPageUrl });
        if (!response || !response.success) {
            console.error(`[DasÖrtliche] Failed to fetch list page`, response ? response.error : 'No response');
            break;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.text, 'text/html');

        const ortsLink = doc.querySelector('a[href*="zvo_ok=1"]');
        if (ortsLink && !doc.querySelector('.hit')) {
            let redirectUrl = ortsLink.getAttribute('href').replace(/&amp;/g, '&');
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = 'https://www.dasoertliche.de' + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
            }
            currentPageUrl = redirectUrl;
            continue;
        }

        const hitsArray = Array.from(doc.querySelectorAll('.hit'));
        let pausedMidPage = false;

        const BATCH_SIZE = 4;
        for (let i = currentHitStartIndex; i < hitsArray.length; i += BATCH_SIZE) {
            if (!isScraping) break;
            if (isPaused) {
                currentHitStartIndex = i;
                pausedMidPage = true;
                saveGmapsSession();
                break;
            }
            if (portalCount >= targetLimit) break;

            const remaining = targetLimit - portalCount;
            // Reduce batch size when near limit to prevent race condition overshoot
            const effectiveBatch = remaining <= BATCH_SIZE ? 1 : BATCH_SIZE;
            const chunk = hitsArray.slice(i, i + Math.min(effectiveBatch, Math.max(remaining, 1)));

            await Promise.allSettled(chunk.map(hit => {
                if (!isScraping || isPaused || portalCount >= targetLimit) return Promise.resolve();
                return processHit(hit);
            }));

            // Recalculate portalCount after batch
            portalCount = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;

            // Remove overshoot trim — no longer needed with single-item batching near limit

            // Save session after each batch for crash recovery
            saveGmapsSession();
        }

        if (!isScraping || portalCount >= targetLimit) break;

        if (pausedMidPage) continue;

        currentHitStartIndex = 0;

        const nextPageLink = doc.querySelector('.paging a[title*="chsten"]') || Array.from(doc.querySelectorAll('.paging a')).find(a => a.textContent.trim() === '›');
        if (nextPageLink) {
            let nextHref = nextPageLink.getAttribute('href').replace(/&amp;/g, '&');
            if (!nextHref.startsWith('http')) {
                nextHref = 'https://www.dasoertliche.de' + (nextHref.startsWith('/') ? '' : '/') + nextHref;
            }
            currentPageUrl = nextHref;
        } else {
            currentPageUrl = null;
        }
        await sleep(200);
    }

    portalCount = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;
    if (isScraping && !isPaused && (portalCount >= targetLimit || !currentPageUrl)) {
        console.log("Scraping finished.");
        if (settings.notifyFinish) finishedSound.play().catch(e => console.error("Audio play error", e));
        isScraping = false;
        isPaused = false;
        clearGmapsSession();
        chrome.storage.local.set({ scrapedData });
        chrome.runtime.sendMessage({ action: 'finished', count: scrapedData.length, portalCount, totalChecked: processedHits || portalCount });
    }
}

/**
 * Modular function to process a single company hit from the search list
 */
async function processHit(hit) {
    if (!isScraping || isPaused) return;
    const portalCount = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;
    if (portalCount >= targetLimit) return;

    try {
        const nameLink = hit.querySelector('.hitlnk_name');
        if (!nameLink) return;

        const company = nameLink.textContent.trim();
        const href = nameLink.getAttribute('href');

        const addressElem = hit.querySelector('address');
        const address = addressElem ? addressElem.textContent.trim().replace(/\s+/g, ' ') : '';

        const phoneElem = hit.querySelector('.phoneblock');
        const phone = phoneElem ? phoneElem.textContent.trim().replace(/\s+/g, ' ') : '';

        if (href) {
            let detailUrl = href;
            if (!detailUrl.startsWith('http')) {
                detailUrl = 'https://www.dasoertliche.de' + (detailUrl.startsWith('/') ? '' : '/') + detailUrl;
            }

            processedHits++;
            const pc = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;
            chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length, portalCount: pc, currentTitle: `[DÖ] Checked ${processedHits} hits... Scanning ${company}` });
            await sleep(Math.random() * 80 + 20); // Short delay, not rate limiting

            // Quick check: try to extract email directly from the list-page hit HTML
            let email = extractEmailFromHtml(hit.innerHTML);

            // If no email on list page, fetch the detail page
            if (!email) {
                const detailResp = await chrome.runtime.sendMessage({ action: 'fetch_text', url: detailUrl });
                if (detailResp && detailResp.success) {
                    const rawHtml = detailResp.text;
                    email = extractEmailFromHtml(rawHtml);
                    
                    if (!email) {
                        const websiteUrl = extractWebsiteUrl(rawHtml);
                        if (websiteUrl) {
                            email = await crawlWebsiteForEmailWithTimeout(websiteUrl);
                        }
                    }
                }
            }

            if (email) {
                // Strict Data Deduplication: Check if email already exists in our dataset
                const isDuplicate = scrapedData.some(item => item.email.toLowerCase() === email.toLowerCase());
                
                // Atomic guard: synchronous check + push with no await in between
                const currentPortalCount = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;
                if (!isDuplicate && currentPortalCount < targetLimit) {
                    scrapedData.push({ company, address, phone, email, source: PORTAL_SOURCE, extractedAt: new Date().toISOString() });
                    const newPc = currentPortalCount + 1;
                    chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length, portalCount: newPc, currentTitle: `[DÖ] Found email for: ${company}` });
                }
            }
        }
    } catch (e) {
        console.error("Error processing company hit:", e);
    }
}

// ─── Message Handler ─────────────────────────────────────────────────────────────
// Uses shared createScraperMessageHandler from utils.js.
// FIX: All cases now correctly return true (async-safe) via the factory.
// FIX: countResults no longer has a gratuitous 1.5s setTimeout delay.
chrome.runtime.onMessage.addListener(
    createScraperMessageHandler(
        () => ({ isScraping, isPaused }),
        {
            onSettings: (s) => {
                settings = s;
                chrome.storage.local.set(s);
            },
            onUpdateLimit: (limit) => { targetLimit = limit; },
            onPause: () => { isPaused = true; },
            onResume: () => { isPaused = false; },
            start: (request, sendResponse) => {
                isScraping = true;
                isPaused = false;
                currentPageUrl = null;
                currentHitStartIndex = 0;
                if (request.reset) {
                    scrapedData = [];
                    processedHits = 0;
                }
                targetLimit = request.limit || 50;
                saveGmapsSession();
                startScraping();
                sendResponse({ status: 'started' });
            },
            stop: (request, sendResponse) => {
                isScraping = false;
                isPaused = false;
                clearGmapsSession();
                chrome.storage.local.set({ scrapedData });
                sendResponse({ status: 'stopped' });
            },
            reset: (request, sendResponse) => {
                isScraping = false;
                isPaused = false;
                scrapedData = [];
                currentPageUrl = null;
                currentHitStartIndex = 0;
                processedHits = 0;
                clearGmapsSession();
                chrome.storage.local.set({ scrapedData: [] });
                sendResponse({ status: 'reset' });
            },
            getData: (request, sendResponse) => {
                sendResponse({ data: scrapedData });
            },
            getInitialInfo: (request, sendResponse) => {
                getDasOertlicheTotal().then(total => {
                    const portalCount = scrapedData.filter(d => d.source === PORTAL_SOURCE).length;
                    sendResponse({
                        total: total,
                        scrapedCount: portalCount,
                        isScraping,
                        isPaused
                    });
                });
            },
            countResults: (request, sendResponse) => {
                getDasOertlicheTotal().then(total => {
                    sendResponse({ total: total });
                });
            },
        }
    )
);
