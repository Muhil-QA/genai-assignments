let selectedElements = [];

/**
 * Handler: When the user clicks the extension’s toolbar icon,
 * we open or focus the side panel associated with the current window.
 */
chrome.action.onClicked.addListener((tab) => {
  // This opens the side panel in Chrome (Experimental APIs).
  // Adjust if you’re using a different approach or want to open a popup window, etc.
  chrome.sidePanel.open({ windowId: tab.windowId });
});

/**
 * Listen for messages from content.js or other parts of the extension.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SELECTED_DOM_CONTENT') {
    /**
     * content.js is sending the combined outerHTML of all currently selected elements.
     * Usually, you'll want to store each update or the final snippet for the user’s next step.
     */
    console.log('[background.js] Received snippet:\n', message.content);

    const combinedSnippet = message.content; // string of concatenated outerHTML lines

    // For demonstration, store in memory:
    selectedElements = [combinedSnippet];

    // Also store it in chrome.storage.sync for easy retrieval in sidepanel or chat:
    chrome.storage.local.set({ combinedDomSnippet: combinedSnippet }, () => {
      console.log('[background] Stored combinedDomSnippet in chrome.storage.local:', combinedSnippet);
    });

    sendResponse({ success: true });
    return true; // async
  }
});
/**
 * Handle extension unload (e.g., browser shutting down, extension disabled).
 * We attempt to send a 'CLEANUP' message to each tab so it can remove highlights, etc.
 */
chrome.runtime.onSuspend.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'CLEANUP' });
      } catch (error) {
        // Ignore errors for tabs where the content script is not running
      }
    }
  } catch (error) {
    console.error('Error during extension cleanup:', error);
  }
});
