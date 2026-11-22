export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { updates } = body; // Array aus { productId, store, price, promo, promoLabel }

    if (!Array.isArray(updates) || updates.length === 0) {
      return Response.json({ ok: false, error: "Keine Preis-Updates übergeben." }, { status: 400 });
    }

    const statements = updates.map((u) =>
      env.DB.prepare(
        `UPDATE store_prices
         SET price = ?, promo = ?, promo_label = ?, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = ? AND store = ?`
      ).bind(
        u.price,
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
