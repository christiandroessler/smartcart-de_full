function getUserKey(request) {
  // Cloudflare Access setzt automatisch den Header mit der authentifizierten Google-E-Mail
  const cfEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  return cfEmail ? cfEmail.toLowerCase().trim() : "default";
}

export async function onRequestGet(context) {
  const { request, env } = context;
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const userKey = getUserKey(request);

  try {
    const body = await request.json();
    const { plz, strategy, list } = body;

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
