// Shine Beauty — PM Product Metrics Report
// 从 analytics_events 集合中读取真实使用数据，生成 PM 视角的产品指标报告
// Run: node scripts/generateReport.js

require('dotenv').config();
const mongoose = require('mongoose');
const Analytics = require('../models/Analytics');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};

const pct = (n, total) => total === 0 ? '0%' : `${Math.round(n / total * 100)}%`;
const avg = (arr) => arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
const p95 = (arr) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const allEvents = await Analytics.find({}).lean();
  const chatEvents = allEvents.filter(e => e.eventType === 'chat_query');
  const browseEvents = allEvents.filter(e => e.eventType === 'browse_products');
  const favoriteEvents = allEvents.filter(e => ['favorite_add', 'favorite_remove'].includes(e.eventType));

  console.log(`\n${C.bold}${C.magenta}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║       ✨ SHINE BEAUTY — PM 产品指标报告                    ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  数据截至: ${new Date().toLocaleString('zh-CN')}  |  总事件数: ${allEvents.length}${C.reset}\n`);

  if (allEvents.length === 0) {
    console.log(`${C.yellow}  暂无埋点数据。请先启动服务器并运行模拟测试：${C.reset}`);
    console.log(`  node tests/runSimulation.js\n`);
    await mongoose.disconnect();
    return;
  }

  // ── 1. 核心漏斗指标 ─────────────────────────────────────────
  console.log(`${C.bold}  📊 核心漏斗指标${C.reset}`);
  const sessions = new Set(chatEvents.map(e => e.userId || e.query?.substring(0, 10))).size;
  const queriesWithRecs = chatEvents.filter(e => (e.recommendationCount ?? 0) > 0).length;
  const queriesWithFollowup = chatEvents.filter(e => e.aiMethod === 'intent_followup' || e.aiMethod === 'keyword_followup').length;

  console.log(`  会话数（估算）     : ${C.bold}${sessions}${C.reset}`);
  console.log(`  Chat 总查询        : ${C.bold}${chatEvents.length}${C.reset}`);
  console.log(`  推荐成功率         : ${C.green}${C.bold}${pct(queriesWithRecs, chatEvents.length)}${C.reset}  (${queriesWithRecs}/${chatEvents.length} 次查询获得推荐)`);
  console.log(`  追问触发率         : ${C.yellow}${pct(queriesWithFollowup, chatEvents.length)}${C.reset}  (信息不足时引导用户补充)`);
  const avgRecs = chatEvents.length > 0
    ? (chatEvents.reduce((s, e) => s + (e.recommendationCount ?? 0), 0) / chatEvents.length).toFixed(1)
    : 0;
  console.log(`  平均推荐数/查询    : ${avgRecs} 款\n`);

  // ── 2. 响应时间 SLA ─────────────────────────────────────────
  console.log(`${C.bold}  ⏱️  响应时间 SLA${C.reset}`);
  const times = chatEvents.map(e => e.responseTimeMs).filter(Boolean);
  console.log(`  平均响应时间       : ${avg(times)}ms`);
  console.log(`  P95 响应时间       : ${p95(times)}ms  ${p95(times) > 10000 ? C.yellow + '（LLM 层较慢，建议前端加 loading 提示）' + C.reset : C.green + '✓' + C.reset}`);

  const byLayer = { L1: [], L2: [], L3: [] };
  chatEvents.forEach(e => {
    if (e.aiLayer === 1 && e.responseTimeMs) byLayer.L1.push(e.responseTimeMs);
    else if (e.aiLayer === 2 && e.responseTimeMs) byLayer.L2.push(e.responseTimeMs);
    else if (e.aiLayer === 3 && e.responseTimeMs) byLayer.L3.push(e.responseTimeMs);
  });
  if (byLayer.L1.length) console.log(`  L1 关键词层平均    : ${avg(byLayer.L1)}ms`);
  if (byLayer.L2.length) console.log(`  L2 LLM层平均       : ${avg(byLayer.L2)}ms`);
  if (byLayer.L3.length) console.log(`  L3 兜底层平均      : ${avg(byLayer.L3)}ms\n`);

  // ── 3. AI 层分布（PM 关注：LLM 成本占比）─────────────────────
  console.log(`${C.bold}  🤖 AI 层分布（直接关联推理成本）${C.reset}`);
  const l1 = chatEvents.filter(e => e.aiLayer === 1 && e.aiMethod === 'keyword_match').length;
  const lf = chatEvents.filter(e => e.aiMethod === 'intent_followup' || e.aiMethod === 'keyword_followup').length;
  const l2 = chatEvents.filter(e => e.aiLayer === 2 && e.aiMethod === 'intent_engine').length;
  const l3 = chatEvents.filter(e => e.aiLayer === 3).length;
  const total = chatEvents.length || 1;

  const bar = (n) => {
    const filled = Math.round(n / total * 20);
    return C.cyan + '█'.repeat(filled) + C.dim + '░'.repeat(20 - filled) + C.reset;
  };
  console.log(`  L1 关键词（零成本）${bar(l1)} ${l1} ${C.dim}(${pct(l1, total)})${C.reset}`);
  console.log(`  L2 意图引擎        ${bar(l2)} ${l2} ${C.dim}(${pct(l2, total)})  ← 您的推荐算法${C.reset}`);
  console.log(`  追问机制           ${bar(lf)} ${lf} ${C.dim}(${pct(lf, total)})${C.reset}`);
  console.log(`  L3 兜底            ${bar(l3)} ${l3} ${C.dim}(${pct(l3, total)})${C.reset}`);
  const llmUsage = pct(l2 + lf, total);
  console.log(`\n  ${C.bold}LLM 调用率: ${llmUsage}${C.reset}  ${C.dim}（低于 50% 代表关键词层有效分流了成本）${C.reset}\n`);

  // ── 4. 语言分布（PM 关注：用户群结构）────────────────────────
  console.log(`${C.bold}  🌐 查询语言分布${C.reset}`);
  const zh = chatEvents.filter(e => e.queryLanguage === 'zh').length;
  const en = chatEvents.filter(e => e.queryLanguage === 'en').length;
  const mixed = chatEvents.filter(e => e.queryLanguage === 'mixed').length;
  console.log(`  中文用户           : ${pct(zh, total)}  (${zh} 次)`);
  console.log(`  英文用户           : ${pct(en, total)}  (${en} 次)`);
  console.log(`  中英混用           : ${pct(mixed, total)}  (${mixed} 次)\n`);

  // ── 5. Browse & Favorites（产品发现漏斗）────────────────────
  if (browseEvents.length > 0 || favoriteEvents.length > 0) {
    console.log(`${C.bold}  🛍️  产品发现漏斗${C.reset}`);
    if (browseEvents.length > 0) {
      const avgResults = avg(browseEvents.map(e => e.resultCount || 0));
      console.log(`  浏览页加载         : ${browseEvents.length} 次  (平均结果 ${avgResults} 款)`);
    }
    const adds = favoriteEvents.filter(e => e.eventType === 'favorite_add').length;
    const removes = favoriteEvents.filter(e => e.eventType === 'favorite_remove').length;
    if (adds > 0) console.log(`  收藏添加           : ${adds} 次`);
    if (removes > 0) console.log(`  收藏移除           : ${removes} 次`);
    console.log();
  }

  // ── 6. PM 视角洞察 ──────────────────────────────────────────
  console.log(`${C.bold}  🎯 PM 洞察 & 迭代建议${C.reset}`);
  if (queriesWithRecs / total < 0.6) {
    console.log(`  ${C.yellow}⚠ 推荐成功率偏低 (${pct(queriesWithRecs, total)})${C.reset} — 考虑降低置信度阈值或扩充关键词库`);
  } else {
    console.log(`  ${C.green}✓ 推荐成功率良好 (${pct(queriesWithRecs, total)})${C.reset}`);
  }
  if (queriesWithFollowup / total > 0.4) {
    console.log(`  ${C.yellow}⚠ 追问触发率偏高 (${pct(queriesWithFollowup, total)})${C.reset} — 用户给了信息但系统仍在追问，需优化意图识别`);
  }
  if (zh / total > 0.3) {
    console.log(`  ${C.cyan}→ 中文用户占比 ${pct(zh, total)}，是核心用户群，优先保障中文推荐质量${C.reset}`);
  }
  if (avg(byLayer.L2) > 8000) {
    console.log(`  ${C.yellow}→ LLM 层 P95 响应 ${p95(byLayer.L2)}ms，建议前端展示"正在思考..."动画${C.reset}`);
  }
  console.log(`  ${C.dim}→ 下一步：A/B 测试置信度阈值（当前 topScore≥4 & gap≥2），看推荐率与精准度的 tradeoff${C.reset}`);
  console.log();

  console.log(`${C.bold}${C.magenta}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║  报告完成  |  数据来源: MongoDB analytics_events 集合      ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
