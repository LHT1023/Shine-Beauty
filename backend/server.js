const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Load env vars
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/products", require("./routes/products"));
app.use("/api/favorites", require("./routes/favorites"));
app.use("/api/chat", require("./routes/chat"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Shine Beauty API",
    timestamp: new Date().toISOString(),
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`\n✨ Shine Beauty API running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Products: http://localhost:${PORT}/api/products`);
    console.log(`   Chat: http://localhost:${PORT}/api/chat\n`);
  });
};

startServer();
