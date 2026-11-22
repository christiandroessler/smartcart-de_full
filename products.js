export async function onRequestGet(context) {
  const { env } = context;

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
      return {
        ...prod,
        prices: storeMap,
      };
    });

    return Response.json({ ok: true, products: formatted });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
