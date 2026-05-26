// Nutrition tracker — USDA FoodData Central (380K+ foods, free DEMO_KEY) with Open Food Facts fallback
export default async function handler(req, res) {
  const { query, action } = req.body || {};

  if (action === "log") {
    return res.json({ ok: true, type: "nutrition_log", data: { logged: query, timestamp: Date.now() } });
  }

  if (!query) return res.status(400).json({ error: "No food query" });

  // Try USDA FoodData Central first (better data, 380K+ foods)
  try {
    const usdaKey = process.env.USDA_API_KEY || "DEMO_KEY";
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaKey}&query=${encodeURIComponent(query)}&pageSize=5&dataType=Foundation,SR Legacy`;
    const usdaResp = await fetch(usdaUrl, { signal: AbortSignal.timeout(8000) });

    if (usdaResp.ok) {
      const usdaData = await usdaResp.json();
      const results = (usdaData.foods || []).slice(0, 5).map(f => {
        const nutrients = {};
        for (const n of f.foodNutrients || []) {
          const name = (n.nutrientName || "").toLowerCase();
          if (name.includes("energy") && (n.unitName === "KCAL" || name.includes("kcal"))) nutrients.calories = n.value;
          if (name.includes("protein")) nutrients.protein = n.value;
          if (name.includes("carbohydrate")) nutrients.carbs = n.value;
          if (name.includes("total lipid") || name === "fat") nutrients.fat = n.value;
          if (name.includes("fiber")) nutrients.fiber = n.value;
          if (name.includes("sugars")) nutrients.sugar = n.value;
          if (name.includes("sodium")) nutrients.sodium = n.value;
          if (name.includes("cholesterol")) nutrients.cholesterol = n.value;
        }
        return {
          name: f.description || "Unknown",
          brand: f.brandName || f.brandOwner || "",
          calories: nutrients.calories || null,
          protein: nutrients.protein || null,
          carbs: nutrients.carbs || null,
          fat: nutrients.fat || null,
          fiber: nutrients.fiber || null,
          sugar: nutrients.sugar || null,
          sodium: nutrients.sodium || null,
          cholesterol: nutrients.cholesterol || null,
          serving: "100g",
          category: f.foodCategory || "",
          image: null,
        };
      });

      if (results.length > 0) {
        return res.json({ ok: true, type: "nutrition", data: { query, results, source: "USDA FoodData Central" } });
      }
    }
  } catch {
    // Fall through to Open Food Facts
  }

  // Fallback: Open Food Facts (free, no key)
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
    const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json();

    const results = (data.products || []).slice(0, 5).map(p => ({
      name: p.product_name || "Unknown",
      brand: p.brands || "",
      calories: p.nutriments?.["energy-kcal_100g"] || p.nutriments?.["energy-kcal"] || null,
      protein: p.nutriments?.proteins_100g || null,
      carbs: p.nutriments?.carbohydrates_100g || null,
      fat: p.nutriments?.fat_100g || null,
      fiber: p.nutriments?.fiber_100g || null,
      sugar: p.nutriments?.sugars_100g || null,
      serving: p.serving_size || "100g",
      nutriscore: p.nutriscore_grade || null,
      image: p.image_front_small_url || null,
    }));

    return res.json({ ok: true, type: "nutrition", data: { query, results, source: "Open Food Facts" } });
  } catch (err) {
    return res.status(500).json({ error: "Nutrition lookup failed", details: err.message });
  }
}
