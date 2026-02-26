const Foundation = require("../models/Foundation");

// GET /api/products - List all with optional filters
exports.getProducts = async (req, res) => {
  try {
    const {
      brand,
      finish,
      coverage,
      skinType,
      minPrice,
      maxPrice,
      isVegan,
      isCrueltyFree,
      sort = "rating",
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    if (brand) filter.brand = { $regex: brand, $options: "i" };
    if (finish) filter.finish = finish;
    if (coverage) filter.coverage = coverage;
    if (skinType) filter.skinTypes = skinType;
    if (isVegan === "true") filter.isVegan = true;
    if (isCrueltyFree === "true") filter.isCrueltyFree = true;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const sortOptions = {
      rating: { rating: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      name: { name: 1 },
    };

    const products = await Foundation.find(filter)
      .sort(sortOptions[sort] || { rating: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Foundation.countDocuments(filter);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("getProducts error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/products/:id - Single product
exports.getProductById = async (req, res) => {
  try {
    const product = await Foundation.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    console.error("getProductById error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/products/search/:query - Text search
exports.searchProducts = async (req, res) => {
  try {
    const { query } = req.params;
    const products = await Foundation.find(
      { $text: { $search: query } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(20);

    res.json({ success: true, data: products });
  } catch (error) {
    console.error("searchProducts error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/products/brands - Get unique brands
exports.getBrands = async (req, res) => {
  try {
    const brands = await Foundation.distinct("brand");
    res.json({ success: true, data: brands.sort() });
  } catch (error) {
    console.error("getBrands error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
