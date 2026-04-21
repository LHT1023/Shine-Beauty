const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  timestamp:           { type: Date, default: Date.now, index: true },
  eventType:           { type: String, index: true },
  method:              String,
  endpoint:            String,
  statusCode:          Number,
  responseTimeMs:      Number,
  // Chat 专用
  userId:              String,
  query:               String,
  queryLanguage:       String,   // 'en' | 'zh' | 'mixed'
  aiLayer:             Number,
  aiMethod:            String,
  recommendationCount: Number,
  intentExtracted:     mongoose.Schema.Types.Mixed,
  // Browse 专用
  filters:             mongoose.Schema.Types.Mixed,
  resultCount:         Number,
  // Favorites 专用
  productId:           String,
}, {
  timestamps: false,
  collection: 'analytics_events',
});

analyticsSchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('Analytics', analyticsSchema);
