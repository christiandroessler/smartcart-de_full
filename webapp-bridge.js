// Brücke zwischen SmartCart DE Web-App und Chrome Extension

window.postMessage({ type: "SMARTCART_EXTENSION_READY", version: "2.0.0" }, "*");

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "SMARTCART_PING_EXTENSION") {
    window.postMessage({ type: "SMARTCART_EXTENSION_READY", version: "2.0.0" }, "*");
  }

  if (event.data?.type === "SMARTCART_FILL_CART") {
    const { store, payload, plz } = event.data;
    chrome.runtime.sendMessage(
      { type: "OPEN_AND_FILL_CART", store, payload, plz },
      (response) => {
        window.postMessage(
          {
            type: "SMARTCART_CART_RESULT",
            store,
            status: response?.ok ? "ok" : "error",
            count: payload?.items?.length || 0,
          },
          "*"
        );
      }
    );
  }

  if (event.data?.type === "SMARTCART_SCRAPE_REWE") {
    const { queries, plz } = event.data;
    chrome.runtime.sendMessage(
      { type: "SCRAPE_REWE_PRICES", queries, plz },
      (response) => {
        if (!response?.ok) {
          window.postMessage({ type: "SMARTCART_REWE_PRICES_ERROR" }, "*");
        }
      }
    );
  }
});

// Empfangene REWE-Preise vom Background-Worker an die React-App übergeben
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "FORWARD_REWE_PRICES") {
    window.postMessage(
      {
        type: "SMARTCART_REWE_PRICES_RESULT",
        updates: msg.updates || [],
      },
      "*"
    );
  }
});
