const OpenAI = require("openai");
const Foundation = require("../models/Foundation");

let openai = null;
try {
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your")) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("✅ OpenAI connected - AI mode enabled");
  } else {
    console.log("⚡ No OpenAI key - keyword matching only");
  }
} catch (e) {
  console.log("⚡ OpenAI init failed - keyword matching only");
}

// ============================================================
// Layer 0: 语言归一化
// 把中文美妆词映射为英文，统一进入同一套评分引擎
// PM 意义：确保中英文用户获得一致的推荐体验
// ============================================================
const CN_EN_MAP = {
  '哑光': 'matte',    '无光': 'matte',    '控光': 'matte',
  '水光': 'dewy',     '水润': 'dewy',     '亮泽': 'dewy',
  '缎面': 'satin',    '自然光泽': 'natural',
  '油皮': 'oily',     '出油': 'oily',
  '干皮': 'dry',      '干性': 'dry',
  '混合肌': 'combination', '混合皮': 'combination', '混油皮': 'combination',
  '敏感肌': 'sensitive',   '敏感皮': 'sensitive',
  '普通皮': 'normal',  '正常皮': 'normal',
  '高遮': 'full coverage',  '全遮': 'full coverage',
  '轻薄': 'light coverage', '无遮': 'light coverage',
  '中等遮瑕': 'medium coverage',
  '控油': 'oily oil control', '痘': 'acne',
  '毛孔': 'pores',    '持久': 'long wear',
  '纯素': 'vegan',    '零残忍': 'cruelty-free',
  '防晒': 'spf',
};

const normalize = (message) => {
  let msg = message.toLowerCase();
  for (const [cn, en] of Object.entries(CN_EN_MAP)) {
    msg = msg.replace(new RegExp(cn, 'g'), en);
  }
  // "200以内" → "under 200"
  msg = msg.replace(/(\d+)\s*(?:以内|以下|块以内|元以内|rmb以内)/g, 'under $1');
  return msg;
};

// ============================================================
// Layer 1: 关键词精确匹配（高置信、零 LLM 成本）
// ============================================================
const keywordMatch = async (message) => {
  const msg = normalize(message);
  let allProducts = await Foundation.find({}).lean();

  // 硬性条件过滤（用户明确表达 must/只要/必须）
  const mustPattern = /\b(must|only|have to|need to|一定|必须|只要|只看)\b/;
  if (mustPattern.test(msg)) {
    if (msg.includes("vegan"))          allProducts = allProducts.filter(p => p.isVegan);
    if (msg.includes("cruelty-free") || msg.includes("cruelty free"))
                                        allProducts = allProducts.filter(p => p.isCrueltyFree);
    if (msg.includes("spf"))            allProducts = allProducts.filter(p => p.spf > 0);
    for (const [kw, type] of [["oily","oily"],["dry","dry"],["combination","combination"],["sensitive","sensitive"]]) {
      if (msg.includes(kw)) allProducts = allProducts.filter(p => p.skinTypes.includes(type));
    }
  }

  const scored = allProducts.map(p => {
    let score = 0;
    const reasons = [];

    // 肤质 +3
    for (const [kw, type] of [["oily","oily"],["dry","dry"],["combination","combination"],["sensitive","sensitive"],["normal","normal"]]) {
      if (msg.includes(kw) && p.skinTypes.includes(type)) {
        score += 3; reasons.push(`suits ${type} skin`);
      }
    }
    // 妆效 +3
    for (const finish of ["matte","dewy","satin","natural","radiant"]) {
      if (msg.includes(finish) && p.finish.toLowerCase() === finish) {
        score += 3; reasons.push(`${finish} finish`);
      }
    }
    // 遮瑕 +2
    for (const cov of ["light","medium","full"]) {
      if (msg.includes(cov) && p.coverage.toLowerCase().includes(cov)) {
        score += 2; reasons.push(`${cov} coverage`);
      }
    }
    // 预算 +2
    const budgetMatch = msg.match(/under\s*\$?(\d+)/);
    if (budgetMatch && p.price <= parseInt(budgetMatch[1])) {
      score += 2; reasons.push(`within budget at $${p.price}`);
    }
    // 品牌 +4（最强信号）
    if (msg.includes(p.brand.toLowerCase())) {
      score += 4; reasons.push(`${p.brand} brand match`);
    }
    // 关注点 +2
    const concerns = { "acne":"acne","pore":"pores","aging":"aging","wrinkle":"aging","dark spot":"dark spots","dull":"dullness","redness":"redness","oil control":"oiliness","long wear":"longevity" };
    for (const [kw, concern] of Object.entries(concerns)) {
      if (msg.includes(kw) && p.concerns.some(c => c.toLowerCase().includes(concern.split(' ')[0]))) {
        score += 2; reasons.push(`addresses ${concern}`);
      }
    }
    // 特殊属性 +1
    if (msg.includes("vegan")        && p.isVegan)      { score += 1; reasons.push("vegan"); }
    if ((msg.includes("cruelty-free") || msg.includes("cruelty free")) && p.isCrueltyFree) { score += 1; reasons.push("cruelty-free"); }
    if (msg.includes("spf")          && p.spf > 0)      { score += 1; reasons.push(`SPF ${p.spf}`); }

    return { product: p, score, reason: reasons.join(", ") };
  });

  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
};

// 判断消息是否覆盖了足够的决策维度（归一化后判断）
const isKeywordMatchable = (message) => {
  const msg = normalize(message);
  const dims = {
    skinType: ["oily","dry","combination","sensitive","normal"].some(kw => msg.includes(kw)),
    finish:   ["matte","dewy","satin","natural","radiant"].some(kw => msg.includes(kw)),
    budget:   /under\s*\$?\d+/.test(msg),
    coverage: ["light coverage","medium coverage","full coverage","sheer"].some(kw => msg.includes(kw)),
    brand:    ["mac","fenty","nars","maybelline","loreal","l'oreal","clinique","bobbi brown",
               "too faced","tarte","lancome","dior","chanel","revlon","covergirl","nyx","ilia",
               "bareminerals","bare minerals","it cosmetics","charlotte tilbury","urban decay",
               "smashbox","benefit","hourglass","laura mercier","milk makeup","merit","kosas",
               "armani","ysl","givenchy","pat mcgrath","estee lauder"].some(kw => msg.includes(kw)),
  };
  if (dims.brand && Object.values(dims).filter(Boolean).length >= 2) return true;
  return [dims.skinType, dims.finish, dims.budget, dims.coverage].filter(Boolean).length >= 2;
};

// ============================================================
// Layer 2a: LLM 意图提取（仅解析 5 个字段，不再传入产品库）
//
// 原架构：把 60 个产品全塞进 prompt，让 GPT 直接给产品 ID
//   问题：① prompt 超长（成本高）② 推荐逻辑是黑盒
//
// 新架构：LLM 只做"自然语言 → 结构化意图"的翻译工作
//   ① prompt 极小（无产品信息），token 成本降低 ~80%
//   ② 推荐决策由自有引擎完成，逻辑完全可解释
// ============================================================
const VALID_ENUMS = {
  skinType: ['oily','dry','combination','sensitive','normal'],
  finish:   ['matte','dewy','satin','natural','radiant'],
  coverage: ['light','medium','medium-to-full','full'],
};

const extractIntent = async (message, conversationHistory = []) => {
  // 拼接最近 6 轮对话作为上下文，让 LLM 能合并多轮偏好
  const context = conversationHistory
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'User' : 'Shine'}: ${m.content.substring(0, 150)}`)
    .join('\n');

  const prompt = `You are a beauty assistant. Extract foundation preferences from the user's message${context ? ' and conversation history' : ''}.
${context ? `\nConversation:\n${context}\n` : ''}
User: "${message}"

Return ONLY valid JSON with these fields (null if not mentioned):
{
  "skinType": "oily|dry|combination|sensitive|normal|null",
  "finish": "matte|dewy|satin|natural|radiant|null",
  "coverage": "light|medium|medium-to-full|full|null",
  "budgetMax": number_or_null,
  "brands": [],
  "concerns": [],
  "vegan": true/false/null,
  "crueltyFree": true/false/null,
  "spf": true/false/null,
  "isComplete": true_if_at_least_2_preferences_mentioned_else_false
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 250,
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(completion.choices[0].message.content);

  // 校验枚举值，防止 LLM 输出非法值进入数据库查询
  for (const [field, allowed] of Object.entries(VALID_ENUMS)) {
    if (raw[field] && !allowed.includes(raw[field])) raw[field] = null;
  }

  // 自主计算 isComplete，不依赖 LLM 判断（LLM 判断过于保守）
  // 规则：≥2 个具体字段，或者有明确的 boolean 属性（vegan/cruelty-free/spf）
  const meaningfulFields = [raw.skinType, raw.finish, raw.coverage, raw.budgetMax,
                             ...(raw.brands || []), ...(raw.concerns || [])].filter(Boolean).length;
  const hasBoolAttr = raw.vegan === true || raw.crueltyFree === true || raw.spf === true;
  raw.isComplete = meaningfulFields >= 2 || hasBoolAttr;

  return raw;
};

// ============================================================
// Layer 2b: 意图驱动的自有匹配引擎
// 分两阶段：① 硬过滤（MongoDB 查询）② 软评分（Python 式打分排序）
// ============================================================
const intentMatch = async (intent) => {
  const filter = {};

  // 第一阶段：硬过滤（不满足直接排除）
  if (intent.skinType)      filter.skinTypes = intent.skinType;
  if (intent.finish)        filter.finish = intent.finish;
  if (intent.coverage)      filter.coverage = { $regex: intent.coverage.split('-')[0], $options: 'i' };
  if (intent.budgetMax)     filter.price = { $lte: Number(intent.budgetMax) };
  if (intent.vegan === true)       filter.isVegan = true;
  if (intent.crueltyFree === true) filter.isCrueltyFree = true;
  if (intent.spf === true)         filter.spf = { $gt: 0 };
  if (intent.brands?.length > 0)  filter.brand = { $in: intent.brands.map(b => new RegExp(b, 'i')) };

  let products = await Foundation.find(filter).lean();

  // 硬过滤结果太少时，放宽肤质限制（保留其他约束）
  if (products.length < 2 && intent.skinType) {
    const relaxed = { ...filter };
    delete relaxed.skinTypes;
    const extra = await Foundation.find(relaxed).lean();
    const seen = new Set(products.map(p => p._id.toString()));
    products = [...products, ...extra.filter(p => !seen.has(p._id.toString()))];
  }

  if (products.length === 0) return [];

  // 第二阶段：软评分（在硬过滤产品中，用评分和关注点进行排序）
  const scored = products.map(p => {
    let soft = p.rating || 4;   // 基础分来自产品评分
    const reasons = [];

    if (intent.skinType && p.skinTypes.includes(intent.skinType)) { soft += 1; reasons.push(`suits ${intent.skinType} skin`); }
    if (intent.finish && p.finish.toLowerCase() === intent.finish) { soft += 1; reasons.push(`${intent.finish} finish`); }
    if (intent.budgetMax && p.price <= intent.budgetMax)           { reasons.push(`$${p.price} within budget`); }
    if (intent.concerns?.length > 0) {
      const matched = intent.concerns.filter(c => p.concerns.some(pc => pc.toLowerCase().includes(c.toLowerCase())));
      soft += matched.length * 0.5;
      if (matched.length) reasons.push(`helps with ${matched.join(', ')}`);
    }
    if (intent.brands?.length > 0 && intent.brands.some(b => p.brand.toLowerCase().includes(b.toLowerCase()))) {
      soft += 2; reasons.push(`from ${p.brand}`);
    }
    if (intent.vegan      && p.isVegan)      reasons.push("vegan");
    if (intent.crueltyFree && p.isCrueltyFree) reasons.push("cruelty-free");

    return {
      product: p,
      score: soft,
      reason: reasons.join('; ') || `${p.rating}/5 rated, matches your preferences`,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
};

// ============================================================
// 追问生成：基于已提取的意图，精准告知用户缺了什么
// 优于原方案：原方案只看原始文本；新方案基于结构化意图，更准确
// ============================================================
const buildFollowUpFromIntent = (intent) => {
  const captured = [];
  if (intent.skinType)  captured.push(`${intent.skinType} skin`);
  if (intent.finish)    captured.push(`${intent.finish} finish`);
  if (intent.budgetMax) captured.push(`budget under $${intent.budgetMax}`);

  const missing = [];
  if (!intent.skinType)  missing.push('skin type (oily, dry, combination, or sensitive)');
  if (!intent.finish)    missing.push('preferred finish (matte, dewy, or satin)');
  if (!intent.budgetMax) missing.push('budget range');

  if (missing.length === 0) return null;

  let msg = captured.length > 0 ? `Got it — noted ${captured.join(' and ')} ✨\n\n` : '';
  msg += `To find your perfect match, could you also share your ${missing[0]}`;
  if (missing[1]) msg += ` and ${missing[1]}`;
  msg += `?`;
  return msg;
};

// ============================================================
// 推荐消息模板（基于提取的意图生成，无需额外 LLM 调用）
// ============================================================
const buildResponseMessage = (intent, count) => {
  const attrs = [];
  if (intent.skinType)    attrs.push(`${intent.skinType} skin`);
  if (intent.finish)      attrs.push(`${intent.finish} finish`);
  if (intent.budgetMax)   attrs.push(`budget ≤$${intent.budgetMax}`);
  if (intent.coverage)    attrs.push(`${intent.coverage} coverage`);
  if (intent.vegan)       attrs.push('vegan');
  if (intent.crueltyFree) attrs.push('cruelty-free');
  const profile = attrs.length > 0 ? `for ${attrs.join(', ')} ` : '';
  return `Here are my top ${count} picks ${profile}✨\n\nThese are matched to your specific needs — let me know if you'd like to explore other options!`;
};

// ============================================================
// Layer 3: 兜底（评分最高的热门产品）
// ============================================================
const fallbackRecommendation = async () => {
  const products = await Foundation.find({}).sort({ rating: -1 }).limit(3).lean();
  return products.map(p => ({
    product: p,
    reason: `Top-rated (${p.rating}/5) — a great starting point! Share your skin type or finish preference for a personalized pick.`,
  }));
};

// ============================================================
// 主入口：三层架构
//
// Layer 1 — 关键词引擎（归一化 + 置信度判断）: <100ms，零 LLM 成本
// Layer 2 — LLM意图提取 + 自有匹配引擎: 1-3s，~80% 成本↓ vs 原方案
// Layer 3 — 热门兜底: 永不崩溃
// ============================================================
exports.chat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "Message is required" });

    // ── Layer 1: 关键词匹配 ─────────────────────────────────────
    if (isKeywordMatchable(message)) {
      const results = await keywordMatch(message);
      if (results.length > 0) {
        const topScore  = results[0].score;
        const scoreGap  = topScore - (results[1]?.score ?? 0);

        // 置信度判断：取代原来粗糙的 fullMatchCount > 10
        // topScore ≥ 4 说明至少匹配了 1 个核心维度 + 1 个其他维度
        // scoreGap ≥ 2 说明第一名显著优于第二名，区分度足够
        if (topScore >= 4 && scoreGap >= 2) {
          console.log(`✅ Layer 1 HIT (score=${topScore}, gap=${scoreGap})`);
          return res.json({
            success: true,
            data: {
              message: "Great question! Based on what you're looking for, here are my top picks ✨\n\nI've matched these to your specific needs — let me know if you'd like other options!",
              recommendations: results.map(r => ({ product: r.product, reason: r.reason })),
              _meta: { layer: 1, method: 'keyword_match', confidence: { topScore, scoreGap } },
            },
          });
        }
        console.log(`⚠️ Layer 1 low confidence (score=${topScore}, gap=${scoreGap}) → Layer 2`);
      }
    }

    // ── Layer 2: LLM 意图提取 + 自有引擎 ───────────────────────
    if (openai) {
      try {
        console.log("🤖 Layer 2: extracting intent...");
        const intent = await extractIntent(message, conversationHistory);
        console.log("📋 Intent:", JSON.stringify(intent));

        // 意图不完整 → 精准追问
        if (!intent.isComplete) {
          const followUp = buildFollowUpFromIntent(intent);
          if (followUp) {
            return res.json({
              success: true,
              data: {
                message: followUp,
                recommendations: [],
                _meta: { layer: 2, method: 'intent_followup', intent },
              },
            });
          }
        }

        // 意图完整 → 自有引擎匹配
        const results = await intentMatch(intent);
        if (results.length > 0) {
          console.log(`✅ Layer 2 HIT: ${results.length} results from intent engine`);
          return res.json({
            success: true,
            data: {
              message: buildResponseMessage(intent, results.length),
              recommendations: results.map(r => ({ product: r.product, reason: r.reason })),
              _meta: { layer: 2, method: 'intent_engine', intent },
            },
          });
        }
        console.log("⚠️ Layer 2 intent engine: 0 results → fallback");
      } catch (err) {
        console.error("❌ Layer 2 ERROR:", err.message);
      }
    }

    // ── Layer 3: 兜底 ───────────────────────────────────────────
    console.log("🛡️ Layer 3: fallback");
    const fallback = await fallbackRecommendation();
    return res.json({
      success: true,
      data: {
        message: "Here are some of our top-rated foundations to get you started ✨\n\nShare your skin type or finish preference and I'll personalize it for you!",
        recommendations: fallback.map(r => ({ product: r.product, reason: r.reason })),
        _meta: { layer: 3, method: 'fallback' },
      },
    });

  } catch (error) {
    console.error("❌ Critical error:", error);
    res.status(500).json({ success: false, error: "Failed to get response" });
  }
};
