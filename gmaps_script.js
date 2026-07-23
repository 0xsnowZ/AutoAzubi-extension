console.log("GMaps script injected for DasÖrtliche scraping overlay");

let isScraping = false;
let isPaused = false;
let scrapedData = [];
let targetLimit = 50;
let currentPageUrl = null;
let processedHits = 0;        // tracks total hits checked across all pages
let currentHitStartIndex = 0; // tracks hit index within the current page for pause/resume

// Helper function to wait
const sleep = ms => new Promise(r => setTimeout(r, ms));

const finishedSound = new Audio(chrome.runtime.getURL('finished.mp3'));

// Settings Cache
let settings = {
    notifyCaptcha: true,
    notifyFinish: true
};

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

function extractEmail(rawHtml) {
    if (!rawHtml) return '';

    let email = '';

    // Strategy 1: href="mailto:..." on .mail anchor
    const mailtoHref = rawHtml.match(/class="mail"[^>]*href="mailto:([^"?\s]+)"/i)
        || rawHtml.match(/href="mailto:([^"?\s]+)"[^>]*class="mail"/i);
    if (mailtoHref) {
        email = mailtoHref[1].trim();
    }

    // Strategy 2: title="..." on .mail anchor
    if (!email) {
        const titleMatch = rawHtml.match(/class="mail"[^>]*title="([^"]+@[^"]+)"/i)
            || rawHtml.match(/title="([^"]+@[^"]+)"[^>]*class="mail"/i);
        if (titleMatch) email = titleMatch[1].trim();
    }

    // Strategy 3: Generic mailto: anywhere
    if (!email) {
        const genericMailto = rawHtml.match(/href="mailto:([^"?\s]+)"/i);
        if (genericMailto) email = genericMailto[1].trim();
    }

    // Strategy 4: data-email attribute (common obfuscation pattern)
    if (!email) {
        const dataEmail = rawHtml.match(/data-email="([^"]+)"/i)
            || rawHtml.match(/data-mail="([^"]+)"/i);
        if (dataEmail) {
            email = dataEmail[1].trim();
            // Some sites encode the email with reversals or substitutions
            email = email.replace(/\(at\)/gi, '@').replace(/\[at\]/gi, '@').replace(/\s*at\s*/gi, '@');
            email = email.replace(/\(dot\)/gi, '.').replace(/\[dot\]/gi, '.').replace(/\s*dot\s*/gi, '.');
        }
    }

    // Strategy 5: onclick handlers with mailto
    if (!email) {
        const onclickMailto = rawHtml.match(/onclick="[^"]*mailto:([^"'\s?]+)/i);
        if (onclickMailto) email = onclickMailto[1].trim();
    }

    // Strategy 6: HTML entity encoded emails (e.g. &#109;&#97;&#105;&#108;)
    if (!email) {
        const entityMatch = rawHtml.match(/href="&#109;&#97;&#105;&#108;&#116;&#111;&#58;([^"]+)"/i);
        if (entityMatch) {
            // Decode HTML entities
            const textarea = document.createElement('textarea');
            textarea.innerHTML = entityMatch[1];
            email = textarea.value.trim();
        }
    }

    // Strategy 7: Obfuscated emails using (at), [at], [AT], etc.
    if (!email) {
        const obfuscatedMatch = rawHtml.match(/[\w.\-]+\s*\[(?:at|AT)\]\s*[\w.\-]+\s*\[(?:dot|DOT)\]\s*[\w.\-]+/);
        if (obfuscatedMatch) {
            email = obfuscatedMatch[0].replace(/\s*\[(?:at|AT)\]\s*/g, '@').replace(/\s*\[(?:dot|DOT)\]\s*/g, '.');
        }
    }

    // Strategy 8: Email with (at) and (dot) parentheses
    if (!email) {
        const parenMatch = rawHtml.match(/[\w.\-]+\s*\(at\)\s*[\w.\-]+\s*\(dot\)\s*[\w.\-]+/i);
        if (parenMatch) {
            email = parenMatch[0].replace(/\s*\(at\)\s*/gi, '@').replace(/\s*\(dot\)\s*/gi, '.');
        }
    }

    // Strategy 9: Broad email regex on visible text (last resort)
    if (!email) {
        // Strip HTML tags to get visible text, then search for email pattern
        const visibleText = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '')
                                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                                   .replace(/<[^>]+>/g, ' ');
        const emailRegex = visibleText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        if (emailRegex) {
            email = emailRegex[0].trim();
            // Filter out obviously false positives like image filenames
            if (/\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf)$/i.test(email)) {
                email = '';
            }
        }
    }

    // Clean up: decode any remaining HTML entities
    if (email && /&#\d+;|&\w+;/.test(email)) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = email;
        email = textarea.value.trim();
    }

    // Final validation: must look like a real email
    if (email && !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
        email = '';
    }

    return email;
}

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
            const homeEmail = extractEmail(homeResp.text);
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
                const email = extractEmail(resp.text);
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

async function startScraping() {
    try {
        await _startScraping();
    } catch (err) {
        console.error('[GMaps] Scraping error:', err);
        isScraping = false;
        isPaused = false;
        chrome.storage.local.set({ isScraping: false, isPaused: false });
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

    while (currentPageUrl && isScraping && scrapedData.length < targetLimit) {
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
        for (let i = currentHitStartIndex; i < hitsArray.length; i += 4) {
            if (!isScraping) break;
            if (isPaused) {
                currentHitStartIndex = i; // remember exact position for resume
                pausedMidPage = true;
                break;
            }
            if (scrapedData.length >= targetLimit) break;

            const chunk = hitsArray.slice(i, i + 4);
            await Promise.all(chunk.map(processHit));

            // Save data once per chunk instead of 4 times concurrently
            chrome.storage.local.set({ scrapedData });
        }

        if (!isScraping || scrapedData.length >= targetLimit) break;

        // Paused mid-page: don't advance to the next page URL.
        // The outer while loop's polling block will wait for resume,
        // then re-fetch the same page starting from currentHitStartIndex.
        if (pausedMidPage) continue;

        // Finished this page cleanly — reset the hit index for the next page.
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

    if (isScraping && !isPaused && (scrapedData.length >= targetLimit || !currentPageUrl)) {
        console.log("Scraping finished.");
        if (settings.notifyFinish) finishedSound.play().catch(e => console.error("Audio play error", e));
        isScraping = false;
        isPaused = false;
        chrome.storage.local.set({ isScraping: false, isPaused: false });
        chrome.runtime.sendMessage({ action: 'finished', count: scrapedData.length });
    }
}

/**
 * Modular function to process a single company hit from the search list
 */
async function processHit(hit) {
    if (!isScraping || isPaused) return;
    if (scrapedData.length >= targetLimit) return;

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
            chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length, currentTitle: `[DÖ] Checked ${processedHits} hits... Scanning ${company}` });
            await sleep(Math.random() * 200 + 50); // Jitter to prevent burst rate limits
            
            const detailResp = await chrome.runtime.sendMessage({ action: 'fetch_text', url: detailUrl });
            if (detailResp && detailResp.success) {
                const rawHtml = detailResp.text;
                let email = extractEmail(rawHtml);
                
                if (!email) {
                    const websiteUrl = extractWebsiteUrl(rawHtml);
                    if (websiteUrl) {
                        email = await crawlWebsiteForEmail(websiteUrl);
                    }
                }

                if (email) {
                    // Strict Data Deduplication: Check if email already exists in our dataset
                    const isDuplicate = scrapedData.some(item => item.email.toLowerCase() === email.toLowerCase());
                    
                    if (!isDuplicate && scrapedData.length < targetLimit) {
                        scrapedData.push({ company, address, phone, email });
                        chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length, currentTitle: `[DÖ] Found email for: ${company}` });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error processing company hit:", e);
    }
}

// Listener to respond to popup.js requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.settings) {
        settings = request.settings;
        chrome.storage.local.set(settings);
    }

    switch (request.action) {
        case 'start':
            isScraping = true;
            isPaused = false;
            currentPageUrl = null;     // always restart from page 1 on fresh start
            currentHitStartIndex = 0;  // always restart hit index
            if (request.reset) {
                scrapedData = [];
                processedHits = 0;
            }
            targetLimit = request.limit || 50;
            startScraping();
            sendResponse({ status: 'started' });
            break;
        case 'pause':
            isPaused = true;
            sendResponse({ status: 'paused' });
            break;
        case 'resume':
            // pause now waits in-place — just unset isPaused, loop continues automatically
            isPaused = false;
            sendResponse({ status: 'resumed' });
            break;
        case 'stop':
            isScraping = false;
            isPaused = false;
            currentPageUrl = null;
            chrome.storage.local.set({ scrapedData });
            sendResponse({ status: 'stopped' });
            break;
        case 'reset':
            isScraping = false;
            isPaused = false;
            scrapedData = [];
            currentPageUrl = null;
            currentHitStartIndex = 0;
            processedHits = 0;
            chrome.storage.local.set({ scrapedData: [] });
            sendResponse({ status: 'reset' });
            break;
        case 'getData':
            sendResponse({ data: scrapedData });
            break;
        case 'getInitialInfo':
            getDasOertlicheTotal().then(total => {
                sendResponse({
                    total: total,
                    scrapedCount: scrapedData.length,
                    isScraping,
                    isPaused
                });
            });
            return true;
        case 'countResults':
            getDasOertlicheTotal().then(total => {
                setTimeout(() => {
                    sendResponse({ total: total });
                }, 1500);
            });
            return true;
    }
    // Return false for synchronous responses and unhandled messages
    return false;
});
