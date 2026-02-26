const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    // For MVP, use a device ID or simple user identifier
    userId: { type: String, required: true, index: true },
    foundationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Foundation",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate favorites
favoriteSchema.index({ userId: 1, foundationId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);
