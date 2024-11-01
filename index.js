import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const healthCheckPort = 10000; // Port for the health check endpoint

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);
app.use(express.json());
// app.use("/uploads", express.static("uploads"));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
app.use("/api", routes);

// Error handling
app.use(errorHandler);

// Start the main server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Health check server
const healthCheckApp = express();

healthCheckApp.get("/healthcheck", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "UP" : "DOWN";

  res.status(dbStatus === "UP" ? 200 : 503).json({
    status: dbStatus,
    message:
      dbStatus === "UP"
        ? "Service is running smoothly"
        : "Service is unavailable",
  });
});

// Start the health check server
healthCheckApp.listen(healthCheckPort, () => {
  console.log(`Health check endpoint running on port ${healthCheckPort}`);
});

export default app;
