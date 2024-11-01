import * as tf from "@tensorflow/tfjs-node";
import * as poseDetection from "@tensorflow-models/pose-detection";
import Analysis from "../models/Analysis.model.js";
import { extractFrames } from "./frameExtraction.service.js";

export const processVideo = async (analysisId, videoPath) => {
  try {
    // Initialize pose detector
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
    );

    // Extract frames from video
    const frames = await extractFrames(videoPath);

    // Analyze poses in frames
    const poses = [];
    for (const frame of frames) {
      const pose = await detector.estimatePoses(frame);
      if (pose.length > 0) {
        poses.push(pose[0]);
      }
    }

    // Analyze movements and calculate scores
    const analysis = await analyzeMovements(poses);

    // Update database with results
    await Analysis.findByIdAndUpdate(analysisId, {
      status: "completed",
      ...analysis,
    });
  } catch (error) {
    console.error("Video processing error:", error);
    await Analysis.findByIdAndUpdate(analysisId, {
      status: "failed",
    });
  }
};

const analyzeMovements = async (poses) => {
  let analysis = {
    scores: {
      sitting: 5,
      rising: 5,
      total: 10,
    },
    deductions: [],
    recommendations: [],
  };

  // Detect hand support
  if (detectHandSupport(poses)) {
    analysis.deductions.push({
      type: "hand",
      points: -1,
      phase: "sitting",
    });
  }

  // Detect knee support
  if (detectKneeSupport(poses)) {
    analysis.deductions.push({
      type: "knee",
      points: -1,
      phase: "rising",
    });
  }

  // Calculate total score and add recommendations
  analysis.scores.total = calculateFinalScore(analysis.deductions);
  analysis.recommendations = generateRecommendations(analysis);
  analysis.riskLevel = assessRiskLevel(analysis.scores.total);

  return analysis;
};

const detectHandSupport = (poses) => {
  // Implement hand support detection logic
  return false;
};

const detectKneeSupport = (poses) => {
  // Implement knee support detection logic
  return false;
};

const calculateFinalScore = (deductions) => {
  const totalDeductions = deductions.reduce((sum, d) => sum + d.points, 0);
  return Math.max(0, 10 + totalDeductions);
};

const generateRecommendations = (analysis) => {
  const recommendations = [];

  if (analysis.deductions.find((d) => d.type === "hand")) {
    recommendations.push({
      area: "Upper Body Strength",
      exercises: ["Wall pushups", "Resistance band exercises"],
      priority: "high",
    });
  }

  if (analysis.deductions.find((d) => d.type === "knee")) {
    recommendations.push({
      area: "Lower Body Strength",
      exercises: ["Chair squats", "Calf raises"],
      priority: "medium",
    });
  }

  return recommendations;
};

const assessRiskLevel = (totalScore) => {
  if (totalScore >= 8) return "low";
  if (totalScore >= 6) return "moderate";
  return "high";
};
