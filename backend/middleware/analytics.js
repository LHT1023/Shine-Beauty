const Analytics = require('../models/Analytics');

// 判断查询语言（中文/英文/混合）
const detectLanguage = (text = '') => {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en';
  const ratio = chineseChars / totalChars;
  if (ratio > 0.5) return 'zh';
  if (ratio > 0.1) return 'mixed';
  return 'en';
};

const analyticsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;

  res.json = function (body) {
    const responseTimeMs = Date.now() - startTime;
    res.json = originalJson;

    // 异步写入，绝不阻塞主响应
    setImmediate(async () => {
      try {
        const url = req.originalUrl;
        let eventType = 'api_call';
        const event = {
          method: req.method,
          endpoint: req.path,
          statusCode: res.statusCode,
          responseTimeMs,
        };

        if (url.includes('/chat')) {
          eventType = 'chat_query';
          const query = req.body?.message || '';
          event.query = query.substring(0, 200);
          event.queryLanguage = detectLanguage(query);
          event.userId = req.body?.userId;
          if (body?.data?._meta) {
            event.aiLayer = body.data._meta.layer;
            event.aiMethod = body.data._meta.method;
            if (body.data._meta.intent) event.intentExtracted = body.data._meta.intent;
          }
          event.recommendationCount = body?.data?.recommendations?.length ?? 0;

        } else if (url.includes('/products') && req.method === 'GET') {
          eventType = url.includes('/search') ? 'product_search' : 'browse_products';
          event.filters = req.query;
          event.resultCount = body?.data?.length ?? body?.pagination?.total ?? 0;

        } else if (url.includes('/favorites')) {
          eventType = req.method === 'POST' ? 'favorite_add'
                    : req.method === 'DELETE' ? 'favorite_remove'
                    : 'favorites_view';
          event.userId = req.params?.userId || req.body?.userId;
          event.productId = req.params?.foundationId || req.body?.foundationId;
        }

        event.eventType = eventType;
        await Analytics.create(event);
      } catch {
        // 埋点失败绝不影响主应用
      }
    });

    return originalJson.call(this, body);
  };

  next();
};

module.exports = analyticsMiddleware;
