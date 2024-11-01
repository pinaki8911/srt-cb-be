import ffmpeg from "fluent-ffmpeg";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

// Configuration constants
const CONFIG = {
  MIN_FRAMES: 20, // Minimum frames needed for analysis
  MAX_FRAMES: 40, // Maximum frames to process
  BASE_FPS: 5, // Base frame rate for extraction
  QUALITY_SCALE: 2, // Scale down factor for better performance
};

/**
 * Extract frames from video with adaptive frame rate
 */
export const extractFramesFromVideo = async (videoPath) => {
  const framesDir = path.join("uploads", `frames-${Date.now()}`);
  await fs.mkdir(framesDir, { recursive: true });

  // Get video duration first
  const duration = await getVideoDuration(videoPath);

  // Calculate optimal FPS based on video duration
  const optimalFps = calculateOptimalFps(duration);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .fps(optimalFps)
      // Add filters for better performance
      .videoFilters([
        // Scale down video for faster processing
        `scale=iw/${CONFIG.QUALITY_SCALE}:-1`,
        // Normalize brightness and contrast
        "normalize",
        // Remove noise
        "unsharp=3:3:1.5:3:3:0.0",
      ])
      // Use better quality settings
      .outputOptions([
        "-q:v",
        "3", // Better quality (1-31, lower is better)
        "-pix_fmt",
        "yuv420p", // Compatible pixel format
      ])
      .on("end", async () => {
        try {
          const files = await fs.readdir(framesDir);
          const framePaths = files
            .filter((file) => file.endsWith(".jpg"))
            .sort((a, b) => {
              // Ensure proper numeric sorting of frames
              const numA = parseInt(a.match(/\d+/)[0]);
              const numB = parseInt(b.match(/\d+/)[0]);
              return numA - numB;
            })
            .map((file) => path.join(framesDir, file));

          // Sample frames if we have too many
          const finalFrames = sampleFrames(framePaths);
          resolve(finalFrames);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => reject(err))
      .save(`${framesDir}/frame-%d.jpg`);
  });
};

/**
 * Calculate optimal FPS based on video duration
 */
const calculateOptimalFps = (duration) => {
  // Aim for optimal number of frames
  const targetFrames = CONFIG.MAX_FRAMES;
  const calculatedFps = targetFrames / duration;

  // Keep FPS within reasonable bounds
  return Math.max(CONFIG.BASE_FPS, Math.min(calculatedFps, 10));
};

/**
 * Get video duration using ffmpeg
 */
const getVideoDuration = async (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      resolve(metadata.format.duration);
    });
  });
};

/**
 * Sample frames if we have too many
 */
const sampleFrames = (frames) => {
  if (frames.length <= CONFIG.MAX_FRAMES) return frames;

  const step = Math.ceil(frames.length / CONFIG.MAX_FRAMES);
  const sampledFrames = [];

  // Always include first and last frames
  sampledFrames.push(frames[0]);

  // Sample middle frames
  for (let i = step; i < frames.length - step; i += step) {
    sampledFrames.push(frames[i]);
  }

  // Add last frame
  sampledFrames.push(frames[frames.length - 1]);

  return sampledFrames;
};

/**
 * Cleanup frames with error handling
 */
export const cleanupFrames = async (framePaths) => {
  if (!framePaths || framePaths.length === 0) return;

  try {
    const directory = path.dirname(framePaths[0]);
    await fs.rm(directory, { recursive: true, force: true });
  } catch (error) {
    console.warn("Frame cleanup warning:", error);
    // Non-critical error, don't throw
  }
};
