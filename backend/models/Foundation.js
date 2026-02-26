const mongoose = require("mongoose");

const foundationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    brand: { type: String, required: true, index: true },
    price: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    finish: {
      type: String,
      enum: ["matte", "dewy", "satin", "natural", "radiant"],
      required: true,
    },
    coverage: {
      type: String,
      enum: ["light", "medium", "medium-to-full", "full"],
      required: true,
    },
    skinTypes: {
      type: [String],
      enum: ["oily", "dry", "combination", "normal", "sensitive"],
      required: true,
    },
    shadeRange: { type: Number, default: 0 },
    undertones: {
      type: [String],
      enum: ["warm", "cool", "neutral"],
      default: ["warm", "cool", "neutral"],
    },
    keyIngredients: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    spf: { type: Number, default: 0 },
    isVegan: { type: Boolean, default: false },
    isCrueltyFree: { type: Boolean, default: false },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Text index for search
foundationSchema.index({ name: "text", brand: "text", description: "text" });

module.exports = mongoose.model("Foundation", foundationSchema);
