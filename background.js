/**
 * Background Service Worker
 * Handles fetch proxy for cross-origin requests (e.g. dasoertliche.de ISO-8859-1)
 */

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetch_text') {
        fetch(request.url)
            .then(res => {
                return res.arrayBuffer().then(buffer => {
                    const decoder = new TextDecoder('iso-8859-1');
                    return decoder.decode(buffer);
                });
            })
            .then(text => sendResponse({ success: true, text: text }))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true; // async response
    }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
});
