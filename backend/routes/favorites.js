const express = require("express");
const router = express.Router();
const {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
} = require("../controllers/favoriteController");

router.get("/:userId", getFavorites);
router.post("/", addFavorite);
router.delete("/:userId/:foundationId", removeFavorite);
router.get("/check/:userId/:foundationId", checkFavorite);

module.exports = router;
