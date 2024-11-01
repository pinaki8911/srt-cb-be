// server/middleware/validateVideo.js
import fs from "fs/promises";

export const validateVideo = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No video file uploaded",
      });
    }

    // Get file stats
    const stats = await fs.stat(req.file.path);
    [];
    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (stats.size > maxSize) {
      // Clean up the file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: "File size exceeds 50MB limit",
      });
    }

    // Validate video format
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Clean up the file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Invalid video format. Supported formats: MP4, WebM, MOV",
      });
    }

    next();
  } catch (error) {
    // Clean up file if exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error("Error deleting invalid file:", unlinkError);
      }
    }
    next(error);
  }
};
