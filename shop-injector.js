// Wird auf dm.de und shop.rewe.de ausgeführt, sobald ein Warenkorb-Auftrag vorliegt

(async function () {
  const data = await chrome.storage.local.get("pendingCart");
  const pending = data.pendingCart;

  // Nur ausführen, wenn Auftrag maximal 2 Minuten alt ist
  if (!pending || Date.now() - pending.createdAt > 120000) return;

  const isDm = window.location.hostname.includes("dm.de") && pending.store === "dm";
  const isRewe = window.location.hostname.includes("rewe.de") && pending.store === "rewe";

  if (!isDm && !isRewe) return;

  // Auftrag sofort verbrauchen, damit Reloads keine doppelten Artikel hinzufügen
  await chrome.storage.local.remove("pendingCart");

  const items = pending.payload?.items || [];
  if (items.length === 0) return;

  showBanner(`SmartCart DE: Befülle ${pending.store.toUpperCase()}-Warenkorb (${items.length} Artikel)...`);

  let successCount = 0;

  if (isDm) {
    // dm Cart-API nutzt die aktuelle Browser-Session (Cookies)
    for (const item of items) {
      if (!item.dan) continue;
      try {
        const res = await fetch("https://cart.dm.de/cart/de/items", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            dan: Number(item.dan),
            quantity: Number(item.qty)
          })
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error("SmartCart dm Fehler:", e);
      }
    }
  }

  if (isRewe) {
    // REWE Shop-API nutzt die aktive Session + ausgewählten Markt
    for (const item of items) {
      if (!item.productId) continue;
      try {
        const res = await fetch("https://shop.rewe.de/api/v3/baskets/items", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            productId: String(item.productId),
            quantity: Number(item.qty)
          })
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error("SmartCart REWE Fehler:", e);
      }
    }
  }

  showBanner(
    `SmartCart DE: ${successCount} von ${items.length} Artikeln hinzugefügt. Seite wird aktualisiert...`,
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
        transition: "all 0.2s ease",
      });
      document.body.appendChild(el);
    }
    el.style.backgroundColor = done ? "#059669" : "#0f172a";
    el.textContent = text;
  }
})();
