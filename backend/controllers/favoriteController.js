const Favorite = require("../models/Favorite");

// GET /api/favorites/:userId
exports.getFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({
      userId: req.params.userId,
    }).populate("foundationId");

    res.json({
      success: true,
      data: favorites.map((f) => f.foundationId).filter(Boolean),
    });
  } catch (error) {
    console.error("getFavorites error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/favorites
exports.addFavorite = async (req, res) => {
  try {
    const { userId, foundationId } = req.body;

    const existing = await Favorite.findOne({ userId, foundationId });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: "Already in favorites" });
    }

    const favorite = await Favorite.create({ userId, foundationId });
    res.status(201).json({ success: true, data: favorite });
  } catch (error) {
    console.error("addFavorite error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /api/favorites/:userId/:foundationId
exports.removeFavorite = async (req, res) => {
  try {
    const { userId, foundationId } = req.params;

    const result = await Favorite.findOneAndDelete({ userId, foundationId });
    if (!result) {
      return res
        .status(404)
        .json({ success: false, error: "Favorite not found" });
    }

    res.json({ success: true, message: "Removed from favorites" });
  } catch (error) {
    console.error("removeFavorite error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/favorites/check/:userId/:foundationId
exports.checkFavorite = async (req, res) => {
  try {
    const { userId, foundationId } = req.params;
    const exists = await Favorite.findOne({ userId, foundationId });
    res.json({ success: true, isFavorited: !!exists });
  } catch (error) {
    console.error("checkFavorite error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
