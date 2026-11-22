// Background Service Worker für SmartCart DE v2 (Warenkorb + REWE Live-Preisabruf)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Warenkorb öffnen & befüllen
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
    return true;
  }

  // 2. Live-Preise bei REWE über einen Hintergrund-Tab abrufen (umgeht Bot-Schutz via echter Session)
  if (message.type === "SCRAPE_REWE_PRICES") {
    const { queries, plz } = message; // Array aus { productId, query }
    const sourceTabId = sender.tab?.id;

    chrome.storage.local.set(
      {
        pendingPriceScrape: {
          queries,
          plz,
          sourceTabId,
          createdAt: Date.now(),
        },
      },
      () => {
        chrome.tabs.create(
          { url: "https://shop.rewe.de/", active: false },
          (tab) => {
            sendResponse({ ok: true, workerTabId: tab.id });
          }
        );
      }
    );
    return true;
  }

  // 3. Ergebnis des REWE-Preisabrufs zurück an die SmartCart Web-App leiten
  if (message.type === "REWE_PRICES_COLLECTED") {
    const { updates, sourceTabId } = message;
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
    if (sourceTabId) {
      chrome.tabs.sendMessage(sourceTabId, {
        type: "FORWARD_REWE_PRICES",
        updates,
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
});
