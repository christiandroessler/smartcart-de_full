// Background Service Worker für SmartCart DE Cart-Bridge

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_AND_FILL_CART") {
    const { store, payload, plz } = message;

    chrome.storage.local.set(
      {
        pendingCart: {
          store,
          payload,
          plz,
          createdAt: Date.now(),
        },
      },
      () => {
        const targetUrl =
          store === "dm"
            ? "https://www.dm.de/cart"
            : "https://shop.rewe.de/checkout/basket";

        chrome.tabs.create({ url: targetUrl, active: true }, (tab) => {
          sendResponse({ ok: true, tabId: tab.id });
        });
      }
    );

    return true; // Asynchrone Antwort offen halten
  }
});
