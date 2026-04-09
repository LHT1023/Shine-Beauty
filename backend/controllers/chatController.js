const OpenAI = require("openai");
const Foundation = require("../models/Foundation");

// ============================================
// OpenAI 初始化（容错：没有key也不崩）
// ============================================
let openai = null;
try {
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your")) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("✅ OpenAI connected - AI mode enabled");
  } else {
    console.log("⚡ No OpenAI key - will use keyword matching only");
  }
} catch (e) {
  console.log("⚡ OpenAI init failed - will use keyword matching only");
}

// ============================================
// 第一层：关键词精确匹配（Rule-based）
// 成本：几乎为零（仅数据库查询+内存计算）
// 适用：用户问题能被关键词直接解析
// ============================================
const keywordMatch = async (message) => {
  const msg = message.toLowerCase();
  let allProducts = await Foundation.find({}).lean();

  // ========== 优化2：硬性条件检测 ==========
  // 用户说 must/only/一定要/必须 + 属性 → 先做硬性过滤，再打分
  const mustPatterns = /\b(must|only|have to|need to|一定|必须|只要|只看)\b/;
  const hasMustModifier = mustPatterns.test(msg);

  if (hasMustModifier) {
    if (msg.includes("vegan") || msg.includes("纯素")) {
      allProducts = allProducts.filter(p => p.isVegan);
    }
    if (msg.includes("cruelty-free") || msg.includes("cruelty free") || msg.includes("零残忍")) {
      allProducts = allProducts.filter(p => p.isCrueltyFree);
    }
    if (msg.includes("spf") || msg.includes("防晒")) {
      allProducts = allProducts.filter(p => p.spf > 0);
    }
    // 肤质硬性过滤
    const skinTypes = { oily: "oily", dry: "dry", combination: "combination", sensitive: "sensitive" };
    for (const [keyword, type] of Object.entries(skinTypes)) {
      if (msg.includes(keyword)) {
        allProducts = allProducts.filter(p => p.skinTypes.includes(type));
      }
    }
  }

  // 对每个产品计算匹配分数
  const scored = allProducts.map((p) => {
    let score = 0;
    const reasons = [];

    // --- 肤质匹配（权重最高，+3）---
    const skinTypes = { oily: "oily", dry: "dry", combination: "combination", sensitive: "sensitive", normal: "normal" };
    for (const [keyword, type] of Object.entries(skinTypes)) {
      if (msg.includes(keyword) && p.skinTypes.includes(type)) {
        score += 3;
        reasons.push(`suits ${type} skin`);
      }
    }

    // --- 妆效匹配（+3）---
    const finishes = ["matte", "dewy", "satin", "natural"];
    for (const finish of finishes) {
      if (msg.includes(finish) && p.finish.toLowerCase() === finish) {
        score += 3;
        reasons.push(`${finish} finish`);
      }
    }

    // --- 遮瑕力度匹配（+2）---
    const coverages = ["light", "medium", "full"];
    for (const cov of coverages) {
      if (msg.includes(cov) && p.coverage.toLowerCase().includes(cov)) {
        score += 2;
        reasons.push(`${cov} coverage`);
      }
    }

    // --- 价格匹配（+2）---
    const budgetMatch = msg.match(/under\s*\$?(\d+)/);
    if (budgetMatch && p.price <= parseInt(budgetMatch[1])) {
      score += 2;
      reasons.push(`within budget at $${p.price}`);
    }
    const budgetMatchCN = msg.match(/(\d+)\s*(?:以内|以下|块以内|元以内)/);
    if (budgetMatchCN && p.price <= parseInt(budgetMatchCN[1])) {
      score += 2;
      reasons.push(`within budget at $${p.price}`);
    }

    // --- 品牌匹配（+4，最高权重）---
    if (msg.includes(p.brand.toLowerCase())) {
      score += 4;
      reasons.push(`matches brand ${p.brand}`);
    }

    // --- 关注点匹配（+2）---
    const concernMap = {
      "acne": "acne", "pore": "pores", "aging": "aging", "wrinkle": "aging",
      "dark spot": "dark spots", "dull": "dullness", "redness": "redness",
      "oil control": "oiliness", "控油": "oiliness", "痘": "acne", "毛孔": "pores"
    };
    for (const [keyword, concern] of Object.entries(concernMap)) {
      if (msg.includes(keyword) && p.concerns.some(c => c.toLowerCase().includes(concern))) {
        score += 2;
        reasons.push(`addresses ${concern}`);
      }
    }

    // --- 特殊属性匹配（+1）---
    if ((msg.includes("vegan") || msg.includes("纯素")) && p.isVegan) {
      score += 1;
      reasons.push("vegan formula");
    }
    if ((msg.includes("cruelty-free") || msg.includes("cruelty free") || msg.includes("零残忍")) && p.isCrueltyFree) {
      score += 1;
      reasons.push("cruelty-free");
    }
    if (msg.includes("spf") && p.spf > 0) {
      score += 1;
      reasons.push(`has SPF ${p.spf}`);
    }

    return { product: p, score, reason: reasons.join(", ") };
  });

  // 按分数排序，取top 3
  const top = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return top;
};

// ============================================
// 优化1：基于"维度覆盖"的路由判断
// 不再只看命中了几个关键词，而是看覆盖了几个核心决策维度
// 核心维度：肤质、妆效、价格（至少覆盖2个不同维度才走第一层）
// ============================================
const isKeywordMatchable = (message) => {
  const msg = message.toLowerCase();

  // 检测每个维度是否被覆盖
  const dimensions = {
    skinType: false,
    finish: false,
    budget: false,
    coverage: false,
    brand: false,
    concern: false,
  };

  // 肤质维度
  const skinKeywords = ["oily", "dry", "combination", "sensitive", "normal", "油皮", "干皮", "混合", "敏感"];
  if (skinKeywords.some(kw => msg.includes(kw))) {
    dimensions.skinType = true;
  }

  // 妆效维度
  const finishKeywords = ["matte", "dewy", "satin", "natural", "哑光", "水光", "缎面"];
  if (finishKeywords.some(kw => msg.includes(kw))) {
    dimensions.finish = true;
  }

  // 价格维度
  if (/under\s*\$?\d+|\d+\s*(?:以内|以下|块以内|元以内)/.test(msg)) {
    dimensions.budget = true;
  }

  // 遮瑕维度
  const coverageKeywords = ["light coverage", "medium coverage", "full coverage", "轻薄", "高遮瑕", "full cover", "sheer"];
  if (coverageKeywords.some(kw => msg.includes(kw))) {
    dimensions.coverage = true;
  }

  // 品牌维度（品牌本身就是最强信号，单独算一个维度）
  // 这里简单检测一些常见品牌名，实际可以从数据库拉品牌列表
  const brandKeywords = [
    "mac", "fenty", "estee lauder", "estée lauder", "nars", "maybelline",
    "loreal", "l'oreal", "clinique", "bobbi brown", "too faced", "tarte",
    "lancome", "lancôme", "dior", "chanel", "revlon", "covergirl",
    "nyx", "ilia", "bare minerals", "bareminerals", "it cosmetics",
    "charlotte tilbury", "urban decay", "smashbox", "benefit",
    "hourglass", "laura mercier", "milk makeup", "merit", "kosas",
    "rose inc", "armani", "ysl", "givenchy", "pat mcgrath"
  ];
  if (brandKeywords.some(kw => msg.includes(kw))) {
    dimensions.brand = true;
  }

  // 关注点维度
  const concernKeywords = [
    "acne", "pore", "aging", "wrinkle", "dark spot", "dull", "redness",
    "oil control", "控油", "痘", "毛孔", "long wear", "持久"
  ];
  if (concernKeywords.some(kw => msg.includes(kw))) {
    dimensions.concern = true;
  }

  // 计算覆盖了几个不同维度
  const coveredDimensions = Object.values(dimensions).filter(v => v).length;

  // 品牌维度特殊处理：品牌+任意1个其他维度就够了（品牌是最强意图信号）
  if (dimensions.brand && coveredDimensions >= 2) return true;

  // 其他情况：至少覆盖2个核心维度（肤质、妆效、价格、遮瑕中的2个）
  const coreDimensions = [dimensions.skinType, dimensions.finish, dimensions.budget, dimensions.coverage];
  const coveredCoreDimensions = coreDimensions.filter(v => v).length;

  return coveredCoreDimensions >= 2;
};

// ============================================
// 优化3：识别用户缺少哪些维度，生成追问消息
// ============================================
const getMissingDimensions = (message) => {
  const msg = message.toLowerCase();
  const missing = [];

  const skinKeywords = ["oily", "dry", "combination", "sensitive", "normal", "油皮", "干皮", "混合", "敏感"];
  const finishKeywords = ["matte", "dewy", "satin", "natural", "哑光", "水光"];
  const hasBudget = /under\s*\$?\d+|\d+\s*(?:以内|以下|块以内|元以内)/.test(msg);

  if (!skinKeywords.some(kw => msg.includes(kw))) {
    missing.push("skin type (oily, dry, combination, sensitive, or normal)");
  }
  if (!finishKeywords.some(kw => msg.includes(kw))) {
    missing.push("preferred finish (matte, dewy, satin, or natural)");
  }
  if (!hasBudget) {
    missing.push("budget range");
  }

  return missing;
};

const buildFollowUpMessage = (matchCount, message) => {
  const missing = getMissingDimensions(message);

  if (missing.length === 0) {
    return null; // 信息已经足够，不需要追问
  }

  let followUp = `I found ${matchCount} options that could work, but I'd love to narrow it down for you! ✨\n\n`;
  followUp += `Could you tell me a bit more about:\n`;
  for (const item of missing) {
    followUp += `• Your ${item}\n`;
  }
  followUp += `\nThat way I can give you a much more personalized recommendation!`;

  return followUp;
};

// ============================================
// 第二层：LLM 语义理解（GPT-4o-mini）
// 成本：API调用费（token计费）
// 适用：模糊/复杂的用户问题
// ============================================
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

const llmChat = async (message, conversationHistory) => {
  const productContext = await buildProductContext();
  const systemPrompt = SYSTEM_PROMPT.replace("{PRODUCT_CONTEXT}", productContext);

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-10),
    { role: "user", content: message },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  });

  return completion.choices[0].message.content;
};

// ============================================
// 第三层：多层解析 + 兜底
// LLM输出是概率性的，格式不一定每次都对
// 五层防线保证100%返回有意义的结果
// ============================================
const parseRecommendations = async (aiResponse) => {
  // --- 防线1: 正则匹配提取分隔符之间的内容 ---
  const recMatch = aiResponse.match(
    /\|\|\|RECOMMENDATIONS\|\|\|([\s\S]*?)\|\|\|END\|\|\|/
  );

  if (recMatch) {
    // --- 防线2: JSON.parse 严格解析 ---
    try {
      const recIds = JSON.parse(recMatch[1].trim());

      // --- 防线3: 产品ID在MongoDB中验证（防幻觉：Ground-Truth Validation）---
      const productIds = recIds.map((r) => r.id);
      const products = await Foundation.find({ _id: { $in: productIds } }).lean();

      const recommendations = recIds
        .map((rec) => ({
          product: products.find((p) => p._id.toString() === rec.id),
          reason: rec.reason,
        }))
        .filter((r) => r.product); // 过滤掉不存在的（幻觉产品）

      if (recommendations.length > 0) {
        return recommendations;
      }
    } catch (parseError) {
      console.warn("⚠️ JSON parse failed, trying loose extraction:", parseError.message);
    }
  }

  // --- 防线4: 宽松正则提取（JSON格式坏了但可能还有ID信息）---
  try {
    const idPattern = /[0-9a-f]{24}/gi;
    const possibleIds = aiResponse.match(idPattern);

    if (possibleIds && possibleIds.length > 0) {
      const uniqueIds = [...new Set(possibleIds)];
      const products = await Foundation.find({ _id: { $in: uniqueIds } }).lean();

      if (products.length > 0) {
        return products.slice(0, 4).map((p) => ({
          product: p,
          reason: "Recommended based on your preferences",
        }));
      }
    }
  } catch (looseError) {
    console.warn("⚠️ Loose extraction also failed:", looseError.message);
  }

  return [];
};

// 兜底推荐：当LLM完全失败时，用评分最高的热门产品
const fallbackRecommendation = async (message) => {
  const msg = message.toLowerCase();
  const allProducts = await Foundation.find({}).lean();

  const keywordResults = await keywordMatch(message);
  if (keywordResults.length > 0) {
    return keywordResults;
  }

  const topRated = allProducts
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map((p) => ({
      product: p,
      reason: `Top-rated foundation (${p.rating}/5) - great starting point!`,
    }));

  return topRated;
};

// ============================================
// 主入口：三级回退调度（含三项优化）
// ============================================
exports.chat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    // ========== 第一层：尝试关键词精确匹配 ==========
    // 优化1：基于维度覆盖判断，而不是简单的关键词数量
    if (isKeywordMatchable(message)) {
      const keywordResults = await keywordMatch(message);

      if (keywordResults.length > 0) {

        // ========== 优化2b：信心度判断 ==========
        // 如果前几名得分太接近，说明区分度不够，降级到LLM
        const topScore = keywordResults[0].score;
        const secondScore = keywordResults.length > 1 ? keywordResults[1].score : 0;
        const scoreGap = topScore - secondScore;

        // 如果第一名得分不够高（<4分），或者匹配结果太多且区分度低
        // 说明信息不够精确，转给LLM或追问
        if (topScore < 4 && scoreGap < 2) {
          console.log(`⚠️ Layer 1 LOW CONFIDENCE: top=${topScore}, gap=${scoreGap}, falling through to LLM`);
          // 不直接返回，fall through 到第二层
        } else {

          // ========== 优化3：结果太多时追问而不是硬推荐 ==========
          // 统计总共有多少产品得分>0（匹配候选池的大小）
          const allScored = await keywordMatch(message);
          const totalMatches = allScored.length;

          // 但这里 allScored 已经是 top 3 了，我们需要看过滤前的总数
          // 重新算一下完整匹配数
          const msg = message.toLowerCase();
          const allProducts = await Foundation.find({}).lean();
          const fullMatchCount = allProducts.filter(p => {
            let s = 0;
            const skinTypes = { oily: "oily", dry: "dry", combination: "combination", sensitive: "sensitive", normal: "normal" };
            for (const [kw, type] of Object.entries(skinTypes)) {
              if (msg.includes(kw) && p.skinTypes.includes(type)) s += 3;
            }
            const finishes = ["matte", "dewy", "satin", "natural"];
            for (const f of finishes) {
              if (msg.includes(f) && p.finish.toLowerCase() === f) s += 3;
            }
            if (msg.includes(p.brand.toLowerCase())) s += 4;
            const budgetMatch = msg.match(/under\s*\$?(\d+)/);
            if (budgetMatch && p.price <= parseInt(budgetMatch[1])) s += 2;
            return s > 0;
          }).length;

          // 如果匹配到超过10个产品，说明条件不够收敛，追问用户
          if (fullMatchCount > 10) {
            const followUp = buildFollowUpMessage(fullMatchCount, message);
            if (followUp) {
              console.log(`💬 Layer 1 FOLLOW-UP: ${fullMatchCount} matches, asking user to narrow down`);
              return res.json({
                success: true,
                data: {
                  message: followUp,
                  recommendations: [],
                  _meta: { layer: 1, method: "keyword_followup", matchCount: fullMatchCount },
                },
              });
            }
          }

          // 信心度够高、结果数量合理，直接返回
          console.log(`✅ Layer 1 HIT: keyword match returned ${keywordResults.length} results (confidence: top=${topScore}, gap=${scoreGap})`);

          const responseMsg =
            "Great question! Based on what you're looking for, here are my top picks ✨\n\n" +
            "I've matched these to your specific needs — take a look and let me know if you'd like to explore different options!";

          return res.json({
            success: true,
            data: {
              message: responseMsg,
              recommendations: keywordResults.map((r) => ({ product: r.product, reason: r.reason })),
              _meta: { layer: 1, method: "keyword_match", confidence: { topScore, scoreGap } },
            },
          });
        }
      }
      console.log("⚠️ Layer 1 MISS: keyword match returned 0 results, falling through to LLM");
    } else {
      console.log("⏭️ Layer 1 SKIP: insufficient dimension coverage, going to LLM");
    }

    // ========== 第二层：LLM 语义理解 ==========
    if (openai) {
      try {
        console.log("🤖 Layer 2: calling GPT-4o-mini...");
        const aiResponse = await llmChat(message, conversationHistory);

        const recommendations = await parseRecommendations(aiResponse);

        const cleanResponse = aiResponse
          .replace(/\|\|\|RECOMMENDATIONS\|\|\|[\s\S]*?\|\|\|END\|\|\|/, "")
          .trim();

        if (recommendations.length > 0) {
          console.log(`✅ Layer 2+3 HIT: LLM + parse returned ${recommendations.length} results`);
          return res.json({
            success: true,
            data: {
              message: cleanResponse,
              recommendations,
              _meta: { layer: 2, method: "llm_semantic" },
            },
          });
        }

        if (cleanResponse.length > 0) {
          console.log("✅ Layer 2: LLM responded (no recommendations - likely a clarifying question)");
          return res.json({
            success: true,
            data: {
              message: cleanResponse,
              recommendations: [],
              _meta: { layer: 2, method: "llm_clarification" },
            },
          });
        }

        console.log("⚠️ Layer 2+3 MISS: LLM response could not be parsed, falling to fallback");
      } catch (llmError) {
        console.error("❌ Layer 2 ERROR:", llmError.message);
      }
    } else {
      console.log("⏭️ Layer 2 SKIP: no OpenAI key available");
    }

    // ========== 兜底层：关键词匹配 + 热门推荐 ==========
    console.log("🛡️ Fallback: using keyword match + top-rated products");
    const fallbackResults = await fallbackRecommendation(message);

    const fallbackMsg =
      "Here are some popular options that might work for you ✨\n\n" +
      "If you can tell me more about your skin type, preferred finish, or budget, I can narrow it down further!";

    return res.json({
      success: true,
      data: {
        message: fallbackMsg,
        recommendations: fallbackResults.map((r) => ({ product: r.product, reason: r.reason })),
        _meta: { layer: 3, method: "fallback" },
      },
    });
  } catch (error) {
    console.error("❌ Critical error:", error);
    res.status(500).json({ success: false, error: "Failed to get response" });
  }
};