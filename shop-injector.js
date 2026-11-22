// Läuft auf dm.de und shop.rewe.de: Befüllt Warenkörbe & fragt REWE-Live-Preise ab

(async function () {
  const storage = await chrome.storage.local.get(["pendingCart", "pendingPriceScrape"]);

  // --- AUFGABE 1: LIVE-PREISE BEI REWE ABRUFEN ---
  const scrapeTask = storage.pendingPriceScrape;
  if (
    scrapeTask &&
    Date.now() - scrapeTask.createdAt < 180000 &&
    window.location.hostname.includes("rewe.de")
  ) {
    await chrome.storage.local.remove("pendingPriceScrape");
    const updates = [];

    for (const item of scrapeTask.queries || []) {
      try {
        const q = encodeURIComponent(item.query);
        // REWE interne Produktsuch-API mit der aktuellen Markt-Session des Browsers
        const res = await fetch(
          `https://shop.rewe.de/api/products?search=${q}&objectsPerPage=3&page=1`,
          {
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );
        if (!res.ok) continue;
        const json = await res.json();
        const product = json?._embedded?.products?.[0];
        const listing = product?._embedded?.articles?.[0]?._embedded?.listing;

        if (listing?.pricing?.currentRetailPrice) {
          // REWE gibt Preise in Cent an (z. B. 115 -> 1.15 €)
          const priceEur = Number(listing.pricing.currentRetailPrice) / 100;
          const isPromo = Boolean(listing.pricing.discount);
          updates.push({
            productId: item.productId,
            store: "rewe",
            price: priceEur,
            externalId: String(product.id || ""),
            brandName: product.productName || item.query,
            promo: isPromo,
            promoLabel: isPromo ? "REWE Angebot" : null,
          });
        }
      } catch (e) {
        console.warn("REWE Preisabruf übersprungen für:", item.query, e);
      }
      // Kurze Pause gegen Rate-Limiting
      await new Promise((r) => setTimeout(r, 220));
    }

    chrome.runtime.sendMessage({
      type: "REWE_PRICES_COLLECTED",
      updates,
      sourceTabId: scrapeTask.sourceTabId,
    });
    return;
  }

  // --- AUFGABE 2: WARENKORB BEFÜLLEN (dm & REWE) ---
  const pending = storage.pendingCart;
  if (!pending || Date.now() - pending.createdAt > 120000) return;

  const isDm = window.location.hostname.includes("dm.de") && pending.store === "dm";
  const isRewe = window.location.hostname.includes("rewe.de") && pending.store === "rewe";
  if (!isDm && !isRewe) return;

  await chrome.storage.local.remove("pendingCart");

  const items = pending.payload?.items || [];
  if (items.length === 0) return;

  showBanner(`SmartCart DE: Befülle ${pending.store.toUpperCase()}-Warenkorb (${items.length} Artikel)...`);

  let successCount = 0;

  if (isDm) {
    for (const item of items) {
      if (!item.dan) continue;
      try {
        const res = await fetch("https://cart.dm.de/cart/de/items", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            dan: Number(item.dan),
            quantity: Number(item.qty),
          }),
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error("SmartCart dm Fehler:", e);
      }
    }
  }

  if (isRewe) {
    for (const item of items) {
      if (!item.productId) continue;
      try {
        const res = await fetch("https://shop.rewe.de/api/v3/baskets/items", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            productId: String(item.productId),
            quantity: Number(item.qty),
          }),
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error("SmartCart REWE Fehler:", e);
      }
    }
  }

  showBanner(
    `SmartCart DE: ${successCount} von ${items.length} Artikeln hinzugefügt. Aktualisiere...`,
    true
  );

  setTimeout(() => {
    window.location.reload();
  }, 1500);

  function showBanner(text, done = false) {
    let el = document.getElementById("smartcart-status-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "smartcart-status-banner";
      Object.assign(el.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "999999",
        padding: "14px 20px",
        borderRadius: "12px",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        fontWeight: "600",
        color: "#ffffff",
        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
      });
      document.body.appendChild(el);
    }
    el.style.backgroundColor = done ? "#059669" : "#0f172a";
    el.textContent = text;
  }
})();
