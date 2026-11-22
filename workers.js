function getUserKey(request) {
  const cfEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  return cfEmail ? cfEmail.toLowerCase().trim() : "default";
}

// Live-Preisabruf direkt über die öffentliche dm-Produktsuch-API
async function refreshDmLivePrices(env, limit = 30) {
  const { results: dmItems } = await env.DB.prepare(
    `SELECT product_id, search_query, external_id
     FROM store_prices
     WHERE store = 'dm' AND (search_query IS NOT NULL OR external_id IS NOT NULL)
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(limit).all();

  let updated = 0;
  const statements = [];

  for (const row of dmItems) {
    const query = encodeURIComponent(row.external_id || row.search_query);
    try {
      const apiUrl = `https://product-search.services.dmtech.com/de/search/crawl?query=${query}&pageSize=3&searchType=product`;
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });

      if (!res.ok) continue;
      const data = await res.json();
      const hit = data?.products?.[0];

      if (hit && hit.price?.value) {
        const livePrice = parseFloat(hit.price.value);
        const liveDan = hit.dan ? String(hit.dan) : row.external_id;
        const liveTitle = hit.title ? `${hit.brandName || ""} ${hit.title}`.trim() : row.search_query;
        const isPromo = Boolean(hit.price?.isSellout || hit.price?.wasPrice);

        if (!isNaN(livePrice) && livePrice > 0) {
          statements.push(
            env.DB.prepare(
              `UPDATE store_prices
               SET price = ?, external_id = ?, brand_name = ?, promo = ?, promo_label = ?, updated_at = CURRENT_TIMESTAMP
               WHERE product_id = ? AND store = 'dm'`
            ).bind(
              livePrice,
              liveDan,
              liveTitle,
              isPromo ? 1 : 0,
              isPromo ? "dm Preis-Tipp" : null,
              row.product_id
            )
          );
          updated++;
        }
      }
    } catch (e) {
      // Einzelnen Fehler überspringen, damit andere Produkte weiterlaufen
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  return updated;
}

// Live-Wochenangebote von Lidl abrufen (öffentliche Such-/Angebots-API)
async function refreshLidlLivePrices(env, limit = 25) {
  const { results: lidlItems } = await env.DB.prepare(
    `SELECT product_id, search_query
     FROM store_prices
     WHERE store = 'lidl' AND search_query IS NOT NULL
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(limit).all();

  let updated = 0;
  const statements = [];

  for (const row of lidlItems) {
    const q = encodeURIComponent(row.search_query);
    try {
      const res = await fetch(`https://www.lidl.de/q/api/search?q=${q}&fetchsize=3&locale=de_DE&assortment=DE`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const item = data?.items?.[0]?.gridbox?.data;
      const priceVal = item?.price?.price;

      if (priceVal && !isNaN(parseFloat(priceVal))) {
        const hasDiscount = Boolean(item?.price?.discount?.percentageDiscount);
        statements.push(
          env.DB.prepare(
            `UPDATE store_prices
             SET price = ?, promo = ?, promo_label = ?, updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ? AND store = 'lidl'`
          ).bind(
            parseFloat(priceVal),
            hasDiscount ? 1 : 0,
            hasDiscount ? `Lidl -${item.price.discount.percentageDiscount}%` : null,
            row.product_id
          )
        );
        updated++;
      }
    } catch {
      // Fallback auf bestehenden Referenzpreis behalten
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  return updated;
}

export default {
  // Automatischer Cronjob (Montag & Donnerstag morgens)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        refreshDmLivePrices(env, 45),
        refreshLidlLivePrices(env, 35),
      ])
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. GET /api/products -> Alle Produkte & Preise inkl. Suchbegriffen für Browser-Scraper
    if (url.pathname === "/api/products" && request.method === "GET") {
      try {
        const { results: products } = await env.DB.prepare(
          "SELECT * FROM products ORDER BY category, name"
        ).all();
        const { results: prices } = await env.DB.prepare(
          "SELECT * FROM store_prices"
        ).all();

        const formatted = products.map((prod) => {
          const storeMap = {};
          for (const p of prices) {
            if (p.product_id === prod.id) {
              storeMap[p.store] = {
                price: p.price,
                promo: Boolean(p.promo),
                promoLabel: p.promo_label,
                externalId: p.external_id,
                brandName: p.brand_name,
                searchQuery: p.search_query,
                updatedAt: p.updated_at,
              };
            }
          }
          return { ...prod, prices: storeMap };
        });

        return Response.json({ ok: true, products: formatted });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // 2. POST /api/products -> Neues Grundprodukt anlegen
    if (url.pathname === "/api/products" && request.method === "POST") {
      try {
        const body = await request.json();
        const { name, category, unit, prices } = body;
        const id =
          name
            .toLowerCase()
            .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "") +
          "_" +
          Date.now().toString().slice(-4);

        const statements = [
          env.DB.prepare(
            "INSERT INTO products (id, name, category, unit, base_unit, base_factor) VALUES (?, ?, ?, ?, 'Stück', 1.0)"
          ).bind(id, name, category || "Sonstiges", unit || "1 Stück"),
        ];

        for (const store of ["dm", "rewe", "lidl", "aldi"]) {
          const entry = prices?.[store] || {};
          const priceVal =
            entry.price !== "" && entry.price !== null && entry.price !== undefined
              ? parseFloat(String(entry.price).replace(",", "."))
              : null;

          statements.push(
            env.DB.prepare(
              `INSERT INTO store_prices (product_id, store, price, promo, promo_label, external_id, brand_name, search_query)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              id,
              store,
              isNaN(priceVal) ? null : priceVal,
              entry.promo ? 1 : 0,
              entry.promo ? "Angebot" : null,
              entry.externalId || null,
              entry.brandName || name,
              entry.searchQuery || name
            )
          );
        }

        await env.DB.batch(statements);
        return Response.json({ ok: true, id });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // 3. POST /api/refresh-server-prices -> Startet Live-Abruf für dm & Lidl auf Knopfdruck
    if (url.pathname === "/api/refresh-server-prices" && request.method === "POST") {
      try {
        const [dmCount, lidlCount] = await Promise.all([
          refreshDmLivePrices(env, 45),
          refreshLidlLivePrices(env, 35),
        ]);
        return Response.json({ ok: true, dmUpdated: dmCount, lidlUpdated: lidlCount });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // 4. POST /api/sync-prices -> Nimmt Live-Preise aus der Chrome-Extension (z.B. REWE) entgegen
    if (url.pathname === "/api/sync-prices" && request.method === "POST") {
      try {
        const { updates } = await request.json();
        if (!Array.isArray(updates) || updates.length === 0) {
          return Response.json({ ok: true, updatedCount: 0 });
        }

        const statements = updates.map((u) =>
          env.DB.prepare(
            `UPDATE store_prices
             SET price = ?,
                 external_id = COALESCE(?, external_id),
                 brand_name = COALESCE(?, brand_name),
                 promo = ?,
                 promo_label = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ? AND store = ?`
          ).bind(
            u.price,
            u.externalId || null,
            u.brandName || null,
            u.promo ? 1 : 0,
            u.promoLabel || null,
            u.productId,
            u.store
          )
        );

        await env.DB.batch(statements);
        return Response.json({ ok: true, updatedCount: updates.length });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // 5. GET /api/list
    if (url.pathname === "/api/list" && request.method === "GET") {
      const userKey = getUserKey(request);
      try {
        let settings = await env.DB.prepare(
          "SELECT plz, strategy FROM user_settings WHERE user_key = ?"
        ).bind(userKey).first();

        if (!settings) {
          await env.DB.prepare(
            "INSERT INTO user_settings (user_key, plz, strategy) VALUES (?, '37308', 'split')"
          ).bind(userKey).run();
          settings = { plz: "37308", strategy: "split" };
        }

        const { results: items } = await env.DB.prepare(
          "SELECT product_id as id, qty FROM shopping_list WHERE user_key = ?"
        ).bind(userKey).all();

        return Response.json({
          ok: true,
          user: userKey,
          plz: settings.plz,
          strategy: settings.strategy,
          list: items,
        });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // 6. POST /api/list
    if (url.pathname === "/api/list" && request.method === "POST") {
      const userKey = getUserKey(request);
      try {
        const { plz, strategy, list } = await request.json();

        if (plz || strategy) {
          await env.DB.prepare(
            `INSERT INTO user_settings (user_key, plz, strategy, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_key) DO UPDATE SET
               plz = COALESCE(excluded.plz, user_settings.plz),
               strategy = COALESCE(excluded.strategy, user_settings.strategy),
               updated_at = CURRENT_TIMESTAMP`
          ).bind(userKey, plz || "37308", strategy || "split").run();
        }

        if (Array.isArray(list)) {
          const statements = [
            env.DB.prepare("DELETE FROM shopping_list WHERE user_key = ?").bind(userKey),
          ];
          for (const item of list) {
            if (item.id && item.qty > 0) {
              statements.push(
                env.DB.prepare(
                  "INSERT INTO shopping_list (user_key, product_id, qty) VALUES (?, ?, ?)"
                ).bind(userKey, item.id, item.qty)
              );
            }
          }
          await env.DB.batch(statements);
        }

        return Response.json({ ok: true, user: userKey });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
