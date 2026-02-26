const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  searchProducts,
  getBrands,
} = require("../controllers/productController");

router.get("/", getProducts);
router.get("/brands", getBrands);
router.get("/search/:query", searchProducts);
router.get("/:id", getProductById);

module.exports = router;
