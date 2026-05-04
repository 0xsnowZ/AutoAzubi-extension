console.log("GMaps script injected for DasÖrtliche scraping overlay");

let isScraping = false;
let isPaused = false;
let scrapedData = [];
let targetLimit = 50;

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

    let nextPageUrl = `https://www.dasoertliche.de/?kw=${encodeURIComponent(keyword)}&ci=${encodeURIComponent(city)}&form_name=search_nat`;

    while (nextPageUrl && isScraping && scrapedData.length < targetLimit) {
        if (isPaused) {
            console.log("Scraping paused...");
            break; // Exit loop, resume will re-call startScraping
        }

        console.log("Fetching list page: " + nextPageUrl);

        const response = await chrome.runtime.sendMessage({ action: 'fetch_text', url: nextPageUrl });
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
            nextPageUrl = redirectUrl;
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

                await sleep(1000); // Be polite to the server

                console.log(`Fetching detail page: ${detailUrl}`);
                const detailResp = await chrome.runtime.sendMessage({ action: 'fetch_text', url: detailUrl });
                if (detailResp && detailResp.success) {
                    const detailDoc = parser.parseFromString(detailResp.text, 'text/html');

                    // requirement: copy the email (in span) in this class "mail"
                    // If "mail" class doesn't exist, ignore it.
                    const mailWrapper = detailDoc.querySelector('.mail');
                    if (mailWrapper) {
                        const mailSpan = mailWrapper.querySelector('span');
                        let email = '';
                        if (mailSpan) {
                            email = mailSpan.textContent.trim();
                        } else {
                            email = mailWrapper.textContent.trim();
                        }

                        email = email.replace('mailto:', '').trim();

                        if (email) {
                            scrapedData.push({
                                company,
                                address,
                                phone,
                                email
                            });
                            console.log(`Extracted data (${scrapedData.length}):`, { company, email });
                            // Store locally just in case
                            chrome.storage.local.set({ scrapedData });
                            // Notify popup if it's open
                            chrome.runtime.sendMessage({ action: 'progress', count: scrapedData.length });
                        } else {
                            console.log("Found mail wrapper but no email content:", company);
                        }
                    } else {
                        console.log("No mail class found in detail page for:", company);
                    }
                }
            }
        }

        if (!isScraping || isPaused || scrapedData.length >= targetLimit) {
            break;
        }

        // Find next page
        const nextPageLink = doc.querySelector('.paging a[title*="chsten"]') || Array.from(doc.querySelectorAll('.paging a')).find(a => a.textContent.trim() === '›');
        if (nextPageLink) {
            let nextHref = nextPageLink.getAttribute('href').replace(/&amp;/g, '&');
            if (!nextHref.startsWith('http')) {
                nextHref = 'https://www.dasoertliche.de' + (nextHref.startsWith('/') ? '' : '/') + nextHref;
            }
            nextPageUrl = nextHref;
            console.log("Found next page:", nextPageUrl);
        } else {
            console.log("No next page link found. Finished.");
            nextPageUrl = null;
        }

        await sleep(2000); // Politeness delay between pages
    }

    if (isScraping && !isPaused && (scrapedData.length >= targetLimit || !nextPageUrl)) {
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
            isPaused = false;
            if (isScraping) startScraping();
            sendResponse({ status: 'resumed' });
            break;
        case 'stop':
            isScraping = false;
            isPaused = false;
            sendResponse({ status: 'stopped' });
            break;
        case 'reset':
            isScraping = false;
            isPaused = false;
            scrapedData = [];
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
