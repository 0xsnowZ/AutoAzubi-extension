// azubi_script.js - Scraper for azubi.de
let isScraping = false;
let isPaused = false;
let targetLimit = 50;

const finishedSound = new Audio(chrome.runtime.getURL('finished.mp3'));
let settings = { notifyFinish: true };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Extract email from raw HTML — avoids DOMParser mailto: resolution issues
function extractEmailFromHtml(html) {
    const mailtoMatch = html.match(/href=["']mailto:([^"'?\s]+)/i);
    if (mailtoMatch) return mailtoMatch[1].trim();

    // Fallback: plain email regex
    const emailMatch = html.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})\b/);
    if (emailMatch) return emailMatch[1].trim();

    return '';
}

// Extract phone from raw HTML — only match tel: href, avoid SVG/other false positives
function extractPhoneFromHtml(html) {
    const telMatch = html.match(/href=["']tel:([^"'?\s]+)/i);
    if (telMatch) return telMatch[1].trim();
    return '';
}

// Extract company name — try JSON-LD first (most reliable), then DOM selectors
function extractCompanyFromDoc(doc) {
    // 1. JSON-LD structured data (most reliable)
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
        try {
            const data = JSON.parse(script.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                if (item.hiringOrganization && item.hiringOrganization.name) {
                    return item.hiringOrganization.name.trim();
                }
                if (item['@type'] === 'Organization' && item.name) {
                    return item.name.trim();
                }
            }
        } catch (e) {}
    }

    // 2. Specific DOM selectors for azubi.de
    const selectors = [
        '[class*="company-name"]',
        '[class*="companyName"]',
        '[class*="employer-name"]',
        '[class*="employerName"]',
        '[class*="corporation"]',
        '[itemprop="name"]',
        '[class*="hiring-organization"]',
    ];
    for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
            const text = el.textContent.trim();
            if (text && text.length < 100) return text;
        }
    }
    return '';
}

// Extract address — use JSON-LD first, then itemprop, then broad text selectors
function extractAddressFromDoc(doc) {
    // 1. JSON-LD structured data
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
        try {
            const data = JSON.parse(script.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                // JobPosting jobLocation
                if (item.jobLocation) {
                    const loc = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
                    if (loc && loc.address) {
                            const addr = loc.address;
                            if (typeof addr === 'string' && addr.trim()) return addr.trim();
                            // streetAddress sometimes already contains postalCode+city — avoid duplication
                            const street = addr.streetAddress || '';
                            const postal = addr.postalCode || '';
                            const city = addr.addressLocality || '';
                            if (street) {
                                // Only append postal/city if not already contained in street
                                const extra = [postal, city].filter(p => p && !street.includes(p));
                                return extra.length ? `${street}, ${extra.join(', ')}` : street;
                            }
                            const parts = [postal, city].filter(Boolean);
                            if (parts.length) return parts.join(', ');
                        }
                    // Sometimes address is directly on the Place
                    if (loc && loc.name) return loc.name.trim();
                }
                // Direct address field
                if (item.address) {
                    const addr = item.address;
                    if (typeof addr === 'string' && addr.trim()) return addr.trim();
                    const parts = [addr.streetAddress, addr.postalCode, addr.addressLocality]
                        .filter(Boolean);
                    if (parts.length) return parts.join(', ');
                }
            }
        } catch (e) {}
    }

    // 2. itemprop selectors (schema.org microdata)
    const locality = doc.querySelector('[itemprop="addressLocality"]');
    const postal = doc.querySelector('[itemprop="postalCode"]');
    const street = doc.querySelector('[itemprop="streetAddress"]');
    if (locality || postal || street) {
        return [street, postal, locality]
            .map(el => el ? el.textContent.trim() : '')
            .filter(Boolean).join(', ');
    }

    // 3. Location-specific selectors — must be short (< 100 chars) to avoid grabbing card text
    const selectors = [
        '[class*="job-location"]',
        '[class*="jobLocation"]',
        '[class*="location-text"]',
        '[class*="locationText"]',
        '[class*="standort"]',
        '[class*="city"]',
        '[class*="ort"]',
        '[data-testid*="location"]',
        '[data-testid*="address"]',
    ];
    for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
            const text = el.textContent.replace(/📍/g, '').trim();
            if (text && text.length < 100) return text;
        }
    }
    return '';
}

// Extract all unique job detail links from a parsed document
function extractJobLinksFromDoc(doc) {
    const links = new Set();
    doc.querySelectorAll('a[href]').forEach(a => {
        // Use getAttribute to get raw href (avoids chrome-extension:// resolution in DOMParser)
        const href = a.getAttribute('href');
        if (!href) return;

        // Build absolute URL
        let url;
        if (href.startsWith('http')) {
            url = href;
        } else if (href.startsWith('/')) {
            url = 'https://www.azubi.de' + href;
        } else {
            return;
        }

        url = url.split('?')[0]; // strip query params

        // Match azubi.de job detail URL patterns — must start with a numeric ID
        if (
            url.match(/azubi\.de\/ausbildungsplatz\/\d+[\w\-]+$/) ||
            url.match(/azubi\.de\/berufsausbildung\/\d+[\w\-]+$/) ||
            url.match(/azubi\.de\/stelle\/\d+[\w\-]+$/)
        ) {
            links.add(url);
        }
    });
    return Array.from(links);
}

// Get job links from the live DOM (current page)
function getJobLinksFromPage() {
    return extractJobLinksFromDoc(document);
}

// Build the search URL for a given page number
// azubi.de uses ?page=N in the URL
function buildPageUrl(baseUrl, page) {
    const url = new URL(baseUrl);
    if (page > 1) {
        url.searchParams.set('page', page);
    } else {
        url.searchParams.delete('page');
    }
    return url.toString();
}

// Main scraping loop — fetches pages directly via URL pagination
async function handleSearchPage(limit = 50) {
    if (isScraping) return;
    isScraping = true;
    isPaused = false;
    targetLimit = limit;

    await sleep(1000);

    let currentData = await new Promise(r => {
        chrome.storage.local.get(['scrapedData'], res => r(res.scrapedData || []));
    });

    const processedLinks = new Set();

    // Determine base search URL (strip page param)
    const baseUrl = (() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('page');
        return url.toString();
    })();

    let page = 1;
    let emptyPageCount = 0;
    const MAX_EMPTY_PAGES = 3;

    while (isScraping && currentData.length < limit) {
        // Pause check
        while (isPaused) {
            await sleep(500);
            if (!isScraping) break;
        }
        if (!isScraping) break;

        // Fetch the search results page
        let pageDoc;
        if (page === 1) {
            // Use the live DOM for page 1 (already loaded)
            pageDoc = document;
        } else {
            const pageUrl = buildPageUrl(baseUrl, page);
            console.log(`[Azubi] Fetching page ${page}: ${pageUrl}`);
            try {
                const res = await fetch(pageUrl, { credentials: 'include' });
                if (!res.ok) {
                    console.warn('[Azubi] Page fetch failed:', res.status);
                    break;
                }
                const html = await res.text();
                const parser = new DOMParser();
                pageDoc = parser.parseFromString(html, 'text/html');
            } catch (err) {
                console.error('[Azubi] Error fetching page:', err);
                break;
            }
        }

        const jobLinks = extractJobLinksFromDoc(pageDoc).filter(l => !processedLinks.has(l));
        console.log(`[Azubi] Page ${page}: found ${jobLinks.length} new job links`);

        if (jobLinks.length === 0) {
            emptyPageCount++;
            if (emptyPageCount >= MAX_EMPTY_PAGES) {
                console.log('[Azubi] No more results after', MAX_EMPTY_PAGES, 'empty pages.');
                break;
            }
            page++;
            continue;
        }

        emptyPageCount = 0;

        for (const jobUrl of jobLinks) {
            if (!isScraping || isPaused) break;
            if (currentData.length >= limit) break;

            processedLinks.add(jobUrl);

            try {
                const response = await fetch(jobUrl, { credentials: 'include' });
                if (!response.ok) {
                    console.warn('[Azubi] Fetch failed:', jobUrl, response.status);
                    continue;
                }

                const html = await response.text();

                const email = extractEmailFromHtml(html);
                if (!email) {
                    console.log('[Azubi] No email, skipping:', jobUrl);
                    continue;
                }

                const phone = extractPhoneFromHtml(html);

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const company = extractCompanyFromDoc(doc);
                const address = extractAddressFromDoc(doc);

                currentData.push({
                    company,
                    email,
                    address,
                    contact: '',
                    anrede: '',
                    link: jobUrl,
                    phone
                });

                await new Promise(r => chrome.storage.local.set({ scrapedData: currentData }, r));
                chrome.runtime.sendMessage({ action: 'progress', count: currentData.length });
                console.log(`[Azubi] Extracted (${currentData.length}/${limit}):`, { company, email, address, phone });

            } catch (err) {
                console.error('[Azubi] Error fetching:', jobUrl, err);
            }

            await sleep(300);
        }

        // Move to next page after processing all links on this page
        if (currentData.length < limit) {
            page++;
        }
    }

    if (isScraping) {
        if (settings.notifyFinish) finishedSound.play().catch(() => {});
        chrome.runtime.sendMessage({ action: 'finished', count: currentData.length });
    }
    isScraping = false;
    isPaused = false;
}

// Count available results on the current page
async function countResults() {
    await sleep(800);

    const selectors = [
        '[class*="result-count"]',
        '[class*="resultCount"]',
        '[class*="headline"]',
        'h1',
        'h2',
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const text = el.innerText || el.textContent || '';
        const match = text.match(/([\d.,]+)\s*(Ausbildung|Stellen|Ergebnisse|results|freie|Jobs|Angebote)/i);
        if (match) return parseInt(match[1].replace(/[.,]/g, ''), 10);
        const numMatch = text.match(/^([\d.,]+)/);
        if (numMatch) return parseInt(numMatch[1].replace(/[.,]/g, ''), 10);
    }

    return getJobLinksFromPage().length;
}

// Listen for popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.settings) {
        settings = request.settings;
    }

    if (request.action === 'countResults') {
        countResults().then(total => sendResponse({ total }));
        return true;
    }
    if (request.action === 'reset') {
        isScraping = false;
        isPaused = false;
        chrome.storage.local.set({ scrapedData: [] }, () => {
            sendResponse({ status: 'reset' });
        });
        return true;
    }
    if (request.action === 'start') {
        const limit = request.limit || 50;
        if (!isScraping) {
            handleSearchPage(limit);
        }
        sendResponse({ status: 'started' });
        return true;
    }
    if (request.action === 'pause') {
        isPaused = true;
        sendResponse({ status: 'paused' });
        return true;
    }
    if (request.action === 'resume') {
        isPaused = false;
        sendResponse({ status: 'resumed' });
        return true;
    }
    if (request.action === 'stop') {
        isScraping = false;
        isPaused = false;
        sendResponse({ status: 'stopped' });
        return true;
    }
    if (request.action === 'getInitialInfo') {
        chrome.storage.local.get(['scrapedData'], (res) => {
            const scount = res.scrapedData ? res.scrapedData.length : 0;
            sendResponse({ isScraping, isPaused, scrapedCount: scount });
        });
        return true;
    }
    if (request.action === 'getData') {
        chrome.storage.local.get(['scrapedData'], (res) => {
            sendResponse({ data: res.scrapedData || [] });
        });
        return true;
    }
});
