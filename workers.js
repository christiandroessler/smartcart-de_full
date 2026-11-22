function getUserKey(request) {
  const cfEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  return cfEmail ? cfEmail.toLowerCase().trim() : "default";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. GET /api/products
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

    // 2. GET /api/list
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

    // 3. POST /api/list
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

    // Alle anderen Anfragen an das React-Frontend (dist/) ausliefern
    return env.ASSETS.fetch(request);
  },
};
