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
// Layer 1: 关键词匹配（硬过滤 + 产品质量排序）
//
// 设计原则：
//   用户提到的所有条件 → 平等对待，全部成为过滤条件
//   过滤后的排序      → 由产品自身评分决定，不由我们的权重决定
//   唯一例外          → 带"prefer/最好"等软信号词的条件，只加分不过滤
// ============================================================

// 判断某个关键词是否以"软偏好"方式提出（有 prefer/最好 等前缀修饰）
const SOFT_SIGNALS = /\b(prefer|if possible|ideally|would love|not necessary|nice to have|最好|如果可以|希望|不一定|可以的话)\b/i;
const isSoftMention = (msg, keyword) => {
  const idx = msg.indexOf(keyword);
  if (idx < 0) return false;
  return SOFT_SIGNALS.test(msg.substring(Math.max(0, idx - 40), idx));
};

const BRANDS = [
  "mac","fenty","nars","maybelline","loreal","l'oreal","clinique","bobbi brown",
  "too faced","tarte","lancome","dior","chanel","revlon","covergirl","nyx","ilia",
  "bareminerals","bare minerals","it cosmetics","charlotte tilbury","urban decay",
  "smashbox","benefit","hourglass","laura mercier","milk makeup","merit","kosas",
  "armani","ysl","givenchy","pat mcgrath","estee lauder",
];

const keywordMatch = async (message) => {
  const msg = normalize(message);
  let products = await Foundation.find({}).lean();

  const hard = {};        // 硬过滤：不满足直接排除
  const soft = {};        // 软偏好：满足小幅加分，不满足不扣分
  const softConcerns = [];

  // ── 提取用户意图，分类为 hard / soft ──────────────────────

  // 肤质
  for (const [kw, type] of [["oily","oily"],["dry","dry"],["combination","combination"],["sensitive","sensitive"],["normal","normal"]]) {
    if (msg.includes(kw)) {
      isSoftMention(msg, kw) ? (soft.skinType = type) : (hard.skinType = type);
    }
  }
  // 妆效
  for (const finish of ["matte","dewy","satin","natural","radiant"]) {
    if (msg.includes(finish)) {
      isSoftMention(msg, finish) ? (soft.finish = finish) : (hard.finish = finish);
    }
  }
  // 预算
  const budgetM = msg.match(/under\s*\$?(\d+)/);
  if (budgetM) {
    const amount = parseInt(budgetM[1]);
    isSoftMention(msg, 'under') ? (soft.budget = amount) : (hard.budget = amount);
  }
  // 遮瑕
  for (const cov of ["light","medium","full","sheer"]) {
    if (msg.includes(cov + ' coverage') || msg.includes(cov + ' cover')) {
      isSoftMention(msg, cov) ? (soft.coverage = cov) : (hard.coverage = cov);
    }
  }
  // 品牌（提到品牌名 = 硬要求，不需要 prefer 修饰）
  for (const brand of BRANDS) {
    if (msg.includes(brand)) { hard.brand = brand; break; }
  }
  // 特殊属性（vegan/cruelty-free/spf 一旦提到即为硬要求）
  if (msg.includes("vegan"))                                         hard.vegan = true;
  if (msg.includes("cruelty-free") || msg.includes("cruelty free")) hard.crueltyFree = true;
  if (msg.includes("spf"))                                           hard.spf = true;
  // 关注点（本质软偏好：满足更好，但不排除不满足的产品）
  const CONCERN_MAP = {
    "acne":"acne","pore":"pores","aging":"aging","wrinkle":"aging",
    "dark spot":"dark spots","dull":"dullness","redness":"redness",
    "oil control":"oiliness","long wear":"longevity",
  };
  for (const [kw, concern] of Object.entries(CONCERN_MAP)) {
    if (msg.includes(kw)) softConcerns.push(concern);
  }

  // ── 硬过滤：用户说的条件一个都不能违反 ────────────────────
  if (hard.skinType)    products = products.filter(p => p.skinTypes.includes(hard.skinType));
  if (hard.finish)      products = products.filter(p => p.finish.toLowerCase() === hard.finish);
  if (hard.budget)      products = products.filter(p => p.price <= hard.budget);
  if (hard.coverage)    products = products.filter(p => p.coverage.toLowerCase().includes(hard.coverage));
  if (hard.brand)       products = products.filter(p => p.brand.toLowerCase().includes(hard.brand));
  if (hard.vegan)       products = products.filter(p => p.isVegan);
  if (hard.crueltyFree) products = products.filter(p => p.isCrueltyFree);
  if (hard.spf)         products = products.filter(p => p.spf > 0);

  if (products.length === 0) return [];

  // ── 软评分：过滤后的产品，用产品质量 + 软偏好加分排序 ────
  // 基础分 = 产品自身评分（不是我们定义的维度权重）
  const scored = products.map(p => {
    let score = p.rating || 4;
    const reasons = [];

    // 把硬匹配条件拼成推荐理由
    if (hard.skinType)    reasons.push(`suits ${hard.skinType} skin`);
    if (hard.finish)      reasons.push(`${hard.finish} finish`);
    if (hard.budget)      reasons.push(`$${p.price} within $${hard.budget} budget`);
    if (hard.brand)       reasons.push(`from ${p.brand}`);
    if (hard.vegan)       reasons.push('vegan');
    if (hard.crueltyFree) reasons.push('cruelty-free');
    if (hard.spf)         reasons.push(`SPF ${p.spf}`);

    // 软偏好满足 → 小幅加分（不满足不扣分）
    if (soft.skinType && p.skinTypes.includes(soft.skinType))              score += 0.5;
    if (soft.finish   && p.finish.toLowerCase() === soft.finish)           score += 0.5;
    if (soft.budget   && p.price <= soft.budget)                           score += 0.5;
    if (soft.coverage && p.coverage.toLowerCase().includes(soft.coverage)) score += 0.5;

    // 关注点满足 → 小幅加分
    if (softConcerns.length > 0) {
      const matched = softConcerns.filter(c =>
        p.concerns.some(pc => pc.toLowerCase().includes(c.split(' ')[0]))
      );
      score += matched.length * 0.3;
      if (matched.length) reasons.push(`helps with ${matched.join(', ')}`);
    }

    return { product: p, score, reason: reasons.join('; ') || `${p.rating}/5 rated` };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
};

// 判断消息是否包含"引用上文"的信号词
// 命中则跳过 Layer 1，直接进 Layer 2（LLM 能读对话历史，理解指代）
const CONTEXTUAL_SIGNALS = /\b(that one|the first|the second|the third|that product|that foundation|instead|alternative|similar to|like that|compared to|cheaper version|budget version|more affordable|affordable version|第一个|第二个|第三个|那个|那款|替代|类似|便宜版|平价版)\b/i;
const isContextualQuery = (message) => CONTEXTUAL_SIGNALS.test(message);

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
    .map(m => {
      let line = `${m.role === 'user' ? 'User' : 'Shine'}: ${m.content.substring(0, 150)}`;
      if (m.recommendations?.length > 0) {
        line += ` [Recommended: ${m.recommendations.slice(0, 3).join(', ')}]`;
      }
      return line;
    })
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
    // 合并最近 2 轮用户消息，让 Layer 1 能跨轮理解意图
    // 例：第1轮"我是油皮" + 第2轮"要哑光" → 合并后检测到 oily + matte
    const recentUserTexts = conversationHistory
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content);
    const mergedMessage = [...recentUserTexts, message].join(' ');

    if (!isContextualQuery(message) && isKeywordMatchable(mergedMessage)) {
      const results = await keywordMatch(mergedMessage);
      // 新置信度逻辑：有结果就返回。
      // 原因：keywordMatch 已对所有用户条件做了硬过滤，
      // 返回的每一个产品都满足用户所有要求，不需要额外的分差检验。
      if (results.length > 0) {
        console.log(`✅ Layer 1 HIT: ${results.length} results (all match user criteria)`);
        return res.json({
          success: true,
          data: {
            message: "Great question! Based on what you're looking for, here are my top picks ✨\n\nI've matched these to your specific needs — let me know if you'd like other options!",
            recommendations: results.map(r => ({ product: r.product, reason: r.reason })),
            _meta: { layer: 1, method: 'keyword_match', resultCount: results.length },
          },
        });
      }
      console.log("⚠️ Layer 1: no products match all criteria → Layer 2");
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
