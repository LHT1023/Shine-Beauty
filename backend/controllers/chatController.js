const OpenAI = require("openai");
const Foundation = require("../models/Foundation");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Build product context for LLM
const buildProductContext = async () => {
  const products = await Foundation.find({}).lean();
  return products
    .map(
      (p) =>
        `[ID:${p._id}] ${p.brand} - ${p.name} | $${p.price} | Finish: ${p.finish} | Coverage: ${p.coverage} | Skin Types: ${p.skinTypes.join(", ")} | SPF: ${p.spf} | Undertones: ${p.undertones.join(", ")} | Key Ingredients: ${p.keyIngredients.join(", ")} | Concerns: ${p.concerns.join(", ")} | Vegan: ${p.isVegan} | Cruelty-Free: ${p.isCrueltyFree} | Rating: ${p.rating}/5 | Shades: ${p.shadeRange}`
    )
    .join("\n");
};

const SYSTEM_PROMPT = `You are Shine ✨, a friendly and knowledgeable beauty consultant specializing in foundation recommendations. 

Your personality:
- Warm, encouraging, and non-judgmental
- You celebrate all skin types and tones
- You explain WHY each product matches, not just WHAT to buy
- You ask clarifying questions when the user's needs are unclear

Your rules:
1. ONLY recommend products from the provided database - NEVER make up products
2. When recommending, always return structured data in this JSON format within your response:
   |||RECOMMENDATIONS|||
   [{"id": "mongodb_id", "reason": "why this matches"}]
   |||END|||
3. Recommend 2-4 products max per response
4. If the user's query is vague, ask about: skin type, coverage preference, finish preference, budget, and any skin concerns
5. Consider ALL factors: skin type compatibility, finish, coverage, price, ingredients, concerns
6. Be conversational - don't just list products, explain your reasoning
7. If asked about something outside foundation/beauty, gently redirect to foundation recommendations

FOUNDATION DATABASE:
{PRODUCT_CONTEXT}`;

// POST /api/chat
exports.chat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ success: false, error: "Message is required" });
    }

    // Build product context
    const productContext = await buildProductContext();
    const systemPrompt = SYSTEM_PROMPT.replace(
      "{PRODUCT_CONTEXT}",
      productContext
    );

    // Build messages array
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiResponse = completion.choices[0].message.content;

    // Parse product recommendations if present
    let recommendations = [];
    const recMatch = aiResponse.match(
      /\|\|\|RECOMMENDATIONS\|\|\|([\s\S]*?)\|\|\|END\|\|\|/
    );

    if (recMatch) {
      try {
        const recIds = JSON.parse(recMatch[1].trim());
        const productIds = recIds.map((r) => r.id);
        const products = await Foundation.find({
          _id: { $in: productIds },
        }).lean();

        recommendations = recIds.map((rec) => {
          const product = products.find(
            (p) => p._id.toString() === rec.id
          );
          return {
            product,
            reason: rec.reason,
          };
        }).filter((r) => r.product);
      } catch (parseError) {
        console.error("Failed to parse recommendations:", parseError);
      }
    }

    // Clean the AI response (remove the JSON block)
    const cleanResponse = aiResponse
      .replace(/\|\|\|RECOMMENDATIONS\|\|\|[\s\S]*?\|\|\|END\|\|\|/, "")
      .trim();

    res.json({
      success: true,
      data: {
        message: cleanResponse,
        recommendations,
      },
    });
  } catch (error) {
    console.error("chat error:", error);

    if (error.code === "insufficient_quota") {
      return res.status(429).json({
        success: false,
        error: "AI service quota exceeded. Please try again later.",
      });
    }

    res.status(500).json({ success: false, error: "Failed to get AI response" });
  }
};
