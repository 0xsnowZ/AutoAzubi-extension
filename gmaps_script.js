console.log("GMaps script injected for DasÖrtliche scraping overlay");

let isScraping = false;
let isPaused = false;
let scrapedData = [];
let targetLimit = 50;
let currentPageUrl = null; // tracks pagination position for pause/resume

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

        // Try the 3 most common German contact page paths (covers ~95% of cases)
        // No sleep between attempts — network round-trip is already a natural delay
        const contactPaths = ['/impressum', '/kontakt', '/imprint'];

        for (const path of contactPaths) {
            if (!isScraping) break;

            const contactUrl = baseUrl + path;
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
    const { keyword, city } = extractKwAndCity();

    if (!keyword || !city) {
        chrome.runtime.sendMessage({ action: 'error', message: 'Could not detect keyword and city. Please search using the popup\'s Google Maps tab.' });
        isScraping = false;
        return;
    }

    console.log(`Starting background scrape for: Keyword=${keyword}, City=${city}`);

    // On first start (or after reset), begin from page 1
    // On resume, currentPageUrl is already set to where we left off
    if (!currentPageUrl) {
        currentPageUrl = `https://www.dasoertliche.de/?kw=${encodeURIComponent(keyword)}&ci=${encodeURIComponent(city)}&form_name=search_nat`;
    }

    while (currentPageUrl && isScraping && scrapedData.length < targetLimit) {
        // Pause: wait in-place instead of breaking out of the loop
        while (isPaused) {
            await sleep(300);
            if (!isScraping) break;
        }
        if (!isScraping) break;

        console.log("Fetching list page: " + currentPageUrl);

        const response = await chrome.runtime.sendMessage({ action: 'fetch_text', url: currentPageUrl });
        if (!response || !response.success) {
            console.error("Failed to fetch list page", response ? response.error : 'No response');
            break;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.text, 'text/html');

        // Handle Ortsauswahl (City Selection)
        const ortsLink = doc.querySelector('a[href*="zvo_ok=1"]');
        if (ortsLink && !doc.querySelector('.hit')) {
            let redirectUrl = ortsLink.getAttribute('href').replace(/&amp;/g, '&');
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = 'https://www.dasoertliche.de' + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
            }
            console.log("Ortsauswahl detected. Redirecting to first option: " + redirectUrl);
            currentPageUrl = redirectUrl;
            continue; // Proceed directly to the valid target page
        }

        const hits = doc.querySelectorAll('.hit');
        if (!hits || hits.length === 0) {
            console.log("No hits found on this page.");
            // check if there's any other indicator
        }

        for (const hit of hits) {
            if (!isScraping || isPaused) break;
            if (scrapedData.length >= targetLimit) break;

            const nameLink = hit.querySelector('.hitlnk_name');
            if (!nameLink) continue;

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

                await sleep(100); // Small delay between detail fetches

                console.log(`Fetching detail page: ${detailUrl}`);
                const detailResp = await chrome.runtime.sendMessage({ action: 'fetch_text', url: detailUrl });
                if (detailResp && detailResp.success) {
                    const rawHtml = detailResp.text;

                    // Extract email from DasÖrtliche detail page using multiple strategies
                    let email = extractEmail(rawHtml);

                    // If no email found on DasÖrtliche, try crawling the company's website
                    if (!email) {
                        const websiteUrl = extractWebsiteUrl(rawHtml);
                        if (websiteUrl) {
                            console.log(`No email on DasÖrtliche. Crawling website: ${websiteUrl}`);
                            await sleep(100);
                            email = await crawlWebsiteForEmail(websiteUrl);
                        }
                    }

                    if (email) {
                        scrapedData.push({
                            company,
                            address,
                            phone,
                            email
                        });
                        console.log(`Extracted data (${scrapedData.length}):`, { company, email });
                        chrome.storage.local.set({ scrapedData });
                        chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length, currentTitle: company });
                    } else {
                        console.log("No email found for:", company);
                    }
                }
            }
        }

        if (!isScraping || scrapedData.length >= targetLimit) {
            break;
        }

        // Find next page
        const nextPageLink = doc.querySelector('.paging a[title*="chsten"]') || Array.from(doc.querySelectorAll('.paging a')).find(a => a.textContent.trim() === '›');
        if (nextPageLink) {
            let nextHref = nextPageLink.getAttribute('href').replace(/&amp;/g, '&');
            if (!nextHref.startsWith('http')) {
                nextHref = 'https://www.dasoertliche.de' + (nextHref.startsWith('/') ? '' : '/') + nextHref;
            }
            currentPageUrl = nextHref;
            console.log("Found next page:", currentPageUrl);
        } else {
            console.log("No next page link found. Finished.");
            currentPageUrl = null;
        }

        await sleep(200); // Delay between pages
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
            currentPageUrl = null; // always restart from page 1 on fresh start
            if (request.reset) {
                scrapedData = [];
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
