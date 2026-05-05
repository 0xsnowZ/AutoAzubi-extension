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

async function startScraping() {
    const { keyword, city } = extractKwAndCity();

    if (!keyword || !city) {
        alert("Could not extract keyword and city automatically. Please ensure you searched using the format 'Keyword in City' via the popup.");
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

            // Check for requirement: look for this class button "hitlnk_mail" or "hitlnk_mail_detail"
            const mailDetailBtn = hit.querySelector('.hitlnk_mail, .hitlnk_mail_detail');
            if (!mailDetailBtn) {
                // if they don't exist, we skip
                continue;
            }

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

                await sleep(200); // Small delay between detail fetches

                console.log(`Fetching detail page: ${detailUrl}`);
                const detailResp = await chrome.runtime.sendMessage({ action: 'fetch_text', url: detailUrl });
                if (detailResp && detailResp.success) {
                    const rawHtml = detailResp.text;

                    // Extract email from raw HTML:
                    // 1. Try href="mailto:..." on .mail anchor
                    // 2. Try title="..." on .mail anchor
                    // 3. Fallback: plain email regex on raw HTML
                    let email = '';

                    const mailtoHref = rawHtml.match(/class="mail"[^>]*href="mailto:([^"?\s]+)"/i)
                        || rawHtml.match(/href="mailto:([^"?\s]+)"[^>]*class="mail"/i);
                    if (mailtoHref) {
                        email = mailtoHref[1].trim();
                    }

                    if (!email) {
                        const titleMatch = rawHtml.match(/class="mail"[^>]*title="([^"@\s]+@[^"@\s]+)"/i)
                            || rawHtml.match(/title="([^"@\s]+@[^"@\s]+)"[^>]*class="mail"/i);
                        if (titleMatch) email = titleMatch[1].trim();
                    }

                    if (!email) {
                        // Generic mailto: fallback
                        const genericMailto = rawHtml.match(/href="mailto:([^"?\s]+)"/i);
                        if (genericMailto) email = genericMailto[1].trim();
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
                        chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length });
                    } else {
                        console.log("No email found in detail page for:", company);
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

        await sleep(500); // Delay between pages
    }

    if (isScraping && !isPaused && (scrapedData.length >= targetLimit || !currentPageUrl)) {
        console.log("Scraping finished.");
        if (settings.notifyFinish) finishedSound.play().catch(e => console.error("Audio play error", e));
        isScraping = false;
        isPaused = false;
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
            sendResponse({ status: 'stopped' });
            break;
        case 'reset':
            isScraping = false;
            isPaused = false;
            scrapedData = [];
            currentPageUrl = null;
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
