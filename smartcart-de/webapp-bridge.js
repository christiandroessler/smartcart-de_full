// Verbindet die SmartCart DE Webanwendung mit dem Chrome Extension Service Worker

window.postMessage({ type: "SMARTCART_EXTENSION_READY" }, "*");

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "SMARTCART_PING_EXTENSION") {
    window.postMessage({ type: "SMARTCART_EXTENSION_READY" }, "*");
  }

  if (event.data?.type === "SMARTCART_FILL_CART") {
    const { store, payload, plz } = event.data;

    chrome.runtime.sendMessage(
      {
        type: "OPEN_AND_FILL_CART",
        store,
        payload,
        plz,
      },
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
});
