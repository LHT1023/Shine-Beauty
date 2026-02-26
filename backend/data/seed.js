const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Foundation = require("../models/Foundation");
const foundations = require("./foundations");

dotenv.config();

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing data
    await Foundation.deleteMany({});
    console.log("🗑️  Cleared existing foundations");

    // Insert seed data
    const result = await Foundation.insertMany(foundations);
    console.log(`✨ Seeded ${result.length} foundations successfully!`);

    // Print summary
    const brands = [...new Set(foundations.map((f) => f.brand))];
    console.log(`\n📊 Summary:`);
    console.log(`   Total products: ${result.length}`);
    console.log(`   Unique brands: ${brands.length}`);
    console.log(`   Brands: ${brands.join(", ")}`);
    console.log(
      `   Price range: $${Math.min(...foundations.map((f) => f.price))} - $${Math.max(...foundations.map((f) => f.price))}`
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
};

seedDB();
