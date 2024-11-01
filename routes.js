// server/routes.js
import express from "express";
import multer from "multer";
import path from "path";
import { analyzeVideo, getReport } from "./controllers/srtController.js";
import { validateVideo } from "./middleware/validateVideo.js";

const router = express.Router();

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only videos are allowed."));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Routes
router.post("/analyse", upload.single("video"), validateVideo, analyzeVideo);
router.get("/report/:id", getReport);

export default router;
