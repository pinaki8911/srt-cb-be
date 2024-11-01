// server/models.js
import mongoose from "mongoose";

const srtResultSchema = new mongoose.Schema({
  // Basic scores
  sitScore: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  riseScore: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  totalScore: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
  },

  // Detailed analysis
  posturalControl: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  balance: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  coordination: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },

  // Movement phases
  sittingPhase: {
    kneeFlexion: Number,
    hipControl: Number,
    spinalAlignment: Number,
  },
  risingPhase: {
    kneeExtension: Number,
    hipDrive: Number,
    stability: Number,
  },

  // Feedback and recommendations
  feedback: {
    strengths: [String],
    improvements: [String],
    recommendations: [String],
  },

  // Media
  videoPath: {
    type: String,
    required: true,
  },
  keyFrames: [String],

  // Metadata
  timestamp: {
    type: Date,
    default: Date.now,
  },
  processingStatus: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
  },
});

export const SRTResult = mongoose.model("SRTResult", srtResultSchema);
