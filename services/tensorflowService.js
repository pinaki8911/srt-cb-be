// server/services/tensorflowService.js
import * as tf from "@tensorflow/tfjs-node";
import * as poseDetection from "@tensorflow-models/pose-detection";
import fs from "fs/promises";
import { extractFramesFromVideo } from "./videoService.js";

const KEYPOINT_CONFIDENCE_THRESHOLD = 0.3;
const MAX_SCORE = 5;
const SUPPORT_PENALTIES = {
  HAND: 1,
  KNEE: 0.5,
};

const SCORE_CONFIG = {
  MIN_PHASE_SCORE: 1.5, // Increased from 1
  PENALTY_FACTOR: 0.6, // Reduced from 0.8
  DEFAULT_HIP_DRIVE: 0.3, // Default when calculation fails
};

const PERFORMANCE_CONFIG = {
  FRAME_WARNING_THRESHOLD: 500, // ms per frame
  TOTAL_WARNING_THRESHOLD: 10000, // 10 seconds total
  MIN_FRAMES: 20,
  MAX_FRAMES: 30,
};

// Utility function for averaging
const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

const isValidScore = (score) => {
  return !isNaN(score) && score !== null && score >= 0 && score <= 1;
};

const safeScore = (score, defaultValue = 0) => {
  return isValidScore(score) ? score : defaultValue;
};

const validatePoints = (p1, p2, p3) => {
  if (!p1 || !p2 || !p3) return false;
  if (
    isNaN(p1.x) ||
    isNaN(p1.y) ||
    isNaN(p2.x) ||
    isNaN(p2.y) ||
    isNaN(p3.x) ||
    isNaN(p3.y)
  )
    return false;
  // Check if points form a degenerate triangle
  const d1 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  const d2 = Math.sqrt(Math.pow(p3.x - p2.x, 2) + Math.pow(p3.y - p2.y, 2));
  if (d1 < 1 || d2 < 1) return false; // Points too close together
  return true;
};

// Calculate angles between points
const calculateAngle = (p1, p2, p3) => {
  if (!validatePoints(p1, p2, p3)) return 0;

  const radians =
    Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const angle = Math.abs((radians * 180.0) / Math.PI);
  return Math.min(360, Math.max(0, angle)); // Ensure angle is between 0 and 360
};

// Initialize pose detector
const initializeDetector = async () => {
  const model = poseDetection.SupportedModels.MoveNet;
  return await poseDetection.createDetector(model, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING, // Use LIGHTNING instead of THUNDER
    enableSmoothing: true,
    multiPoseMaxDimension: 256, // Reduce resolution for faster processing
  });
};

const detectSupportPoints = (pose) => {
  const supports = [];
  const groundLevel = Math.max(
    ...pose.keypoints
      .filter((kp) => kp.score > KEYPOINT_CONFIDENCE_THRESHOLD)
      .map((kp) => kp.y)
  );

  // Adjusted thresholds relative to ground level
  const handSupportThreshold = groundLevel - pose.height * 0.3;
  const kneeSupportThreshold = groundLevel - pose.height * 0.2;

  // Check hand support with ground reference
  const wrists = [
    pose.keypoints.find((kp) => kp.name === "left_wrist"),
    pose.keypoints.find((kp) => kp.name === "right_wrist"),
  ];

  if (
    wrists.some(
      (wrist) =>
        wrist?.score > KEYPOINT_CONFIDENCE_THRESHOLD &&
        wrist.y > handSupportThreshold
    )
  ) {
    supports.push("HAND");
  }

  // Check knee support with ground reference
  const knees = [
    pose.keypoints.find((kp) => kp.name === "left_knee"),
    pose.keypoints.find((kp) => kp.name === "right_knee"),
  ];

  if (
    knees.some(
      (knee) =>
        knee?.score > KEYPOINT_CONFIDENCE_THRESHOLD &&
        knee.y > kneeSupportThreshold
    )
  ) {
    supports.push("KNEE");
  }

  return supports;
};

const detectPhaseTransition = (poses) => {
  let transitionFrame = Math.floor(poses.length / 2); // Default to middle
  let maxHipMovement = 0;
  let maxHipY = -Infinity;
  let lowestHipFrame = 0;

  for (let i = 1; i < poses.length - 1; i++) {
    const prevHip = poses[i - 1].keypoints.find(
      (kp) => kp.name === "right_hip"
    );
    const currentHip = poses[i].keypoints.find((kp) => kp.name === "right_hip");
    const nextHip = poses[i + 1].keypoints.find(
      (kp) => kp.name === "right_hip"
    );

    if (
      prevHip?.score > KEYPOINT_CONFIDENCE_THRESHOLD &&
      currentHip?.score > KEYPOINT_CONFIDENCE_THRESHOLD &&
      nextHip?.score > KEYPOINT_CONFIDENCE_THRESHOLD
    ) {
      // Track both movement and lowest position
      const movement = Math.abs(nextHip.y - prevHip.y);
      if (movement > maxHipMovement) {
        maxHipMovement = movement;
        transitionFrame = i;
      }

      if (currentHip.y > maxHipY) {
        maxHipY = currentHip.y;
        lowestHipFrame = i;
      }
    }
  }

  // Use the frame that best represents the transition
  return Math.abs(lowestHipFrame - transitionFrame) < 5
    ? lowestHipFrame // Clear lowest point detected
    : transitionFrame; // Use maximum movement point
};

// Analyze single frame
const analyzePoseInFrame = async (detector, imagePath) => {
  let tfImage;
  try {
    const imageBuffer = await fs.readFile(imagePath);
    tfImage = tf.node.decodeImage(imageBuffer);
    const poses = await detector.estimatePoses(tfImage, {
      maxPoses: 1,
      flipHorizontal: false,
      scoreThreshold: 0.3,
    });
    return poses[0];
  } finally {
    if (tfImage) {
      tfImage.dispose();
      tf.engine().startScope();
    }
  }
};

// Analyze spinal alignment
const analyzeSpinalAlignment = (pose) => {
  const shoulder = pose.keypoints.find((kp) => kp.name === "right_shoulder");
  const hip = pose.keypoints.find((kp) => kp.name === "right_hip");
  const knee = pose.keypoints.find((kp) => kp.name === "right_knee");

  if (shoulder && hip && knee) {
    const angle = calculateAngle(shoulder, hip, knee);
    return {
      angle,
      score: Math.abs(180 - angle) / 180, // Normalize to 0-1
    };
  }
  return { angle: 0, score: 0 };
};

// Analyze knee flexion
const analyzeKneeFlexion = (pose) => {
  const hip = pose.keypoints.find((kp) => kp.name === "right_hip");
  const knee = pose.keypoints.find((kp) => kp.name === "right_knee");
  const ankle = pose.keypoints.find((kp) => kp.name === "right_ankle");

  if (hip && knee && ankle) {
    const angle = calculateAngle(hip, knee, ankle);
    return {
      angle,
      score: angle > 90 ? 1 : angle / 90,
    };
  }
  return { angle: 0, score: 0 };
};

// Analyze knee extension
const analyzeKneeExtension = (pose) => {
  const hip = pose.keypoints.find((kp) => kp.name === "right_hip");
  const knee = pose.keypoints.find((kp) => kp.name === "right_knee");
  const ankle = pose.keypoints.find((kp) => kp.name === "right_ankle");

  if (hip && knee && ankle) {
    const angle = calculateAngle(hip, knee, ankle);
    return {
      angle,
      score: angle > 160 ? 1 : angle / 160, // Score based on knee straightening
    };
  }
  return { angle: 0, score: 0 };
};

// Analyze hip control
const analyzeHipControl = (pose) => {
  const shoulder = pose.keypoints.find((kp) => kp.name === "right_shoulder");
  const hip = pose.keypoints.find((kp) => kp.name === "right_hip");
  const knee = pose.keypoints.find((kp) => kp.name === "right_knee");

  if (
    shoulder?.score > KEYPOINT_CONFIDENCE_THRESHOLD &&
    hip?.score > KEYPOINT_CONFIDENCE_THRESHOLD &&
    knee?.score > KEYPOINT_CONFIDENCE_THRESHOLD
  ) {
    const angle = calculateAngle(shoulder, hip, knee);
    // Normalize score between 0 and 1, prevent negative values
    const score = Math.max(0, Math.min(1, angle < 30 ? 1 : (90 - angle) / 60));
    return {
      angle,
      score,
    };
  }
  return { angle: 0, score: 0 };
};

// Analyze hip drive
const analyzeHipDrive = (pose) => {
  const shoulder = pose.keypoints.find((kp) => kp.name === "right_shoulder");
  const hip = pose.keypoints.find((kp) => kp.name === "right_hip");
  const knee = pose.keypoints.find((kp) => kp.name === "right_knee");
  const ankle = pose.keypoints.find((kp) => kp.name === "right_ankle");

  if (
    ![shoulder, hip, knee, ankle].every(
      (point) => point?.score > KEYPOINT_CONFIDENCE_THRESHOLD
    )
  ) {
    return { angle: 0, score: SCORE_CONFIG.DEFAULT_HIP_DRIVE };
  }

  // Calculate vertical progress (how high the hip is relative to its range)
  const totalHeight = shoulder.y - ankle.y;
  if (totalHeight <= 0)
    return { angle: 0, score: SCORE_CONFIG.DEFAULT_HIP_DRIVE };

  const hipProgress = Math.max(
    0,
    Math.min(1, (ankle.y - hip.y) / (ankle.y - shoulder.y))
  );
  const verticalAlignment = Math.abs(hip.x - ankle.x) / pose.width;

  // Calculate trunk angle
  const trunkAngle = calculateAngle(shoulder, hip, knee);
  const angleScore = Math.max(0, Math.min(1, trunkAngle / 180));

  // Combined score with more emphasis on vertical movement
  const score = safeScore(
    hipProgress * 0.5 + // Vertical movement is key
      angleScore * 0.3 + // Trunk angle is important
      (1 - verticalAlignment) * 0.2, // Alignment is supplementary
    SCORE_CONFIG.DEFAULT_HIP_DRIVE
  );

  return {
    angle: trunkAngle,
    score: score,
  };
};

// Analyze stability
const analyzeStability = (pose) => {
  const ankle = pose.keypoints.find((kp) => kp.name === "right_ankle");
  const hip = pose.keypoints.find((kp) => kp.name === "right_hip");
  const shoulder = pose.keypoints.find((kp) => kp.name === "right_shoulder");

  if (ankle && hip && shoulder) {
    const verticalDeviation =
      Math.abs(shoulder.x - hip.x) + Math.abs(hip.x - ankle.x);
    return {
      deviation: verticalDeviation,
      score: Math.max(0, 1 - verticalDeviation / 100),
    };
  }
  return { deviation: 0, score: 0 };
};

// Analyze sitting phase
const analyzeSittingPhase = (poses) => {
  return poses.map((pose) => ({
    kneeFlexion: analyzeKneeFlexion(pose),
    hipControl: analyzeHipControl(pose),
    spinalAlignment: analyzeSpinalAlignment(pose),
  }));
};

// Analyze rising phase
const analyzeRisingPhase = (poses) => {
  return poses.map((pose) => ({
    kneeExtension: analyzeKneeExtension(pose),
    hipDrive: analyzeHipDrive(pose),
    stability: analyzeStability(pose),
  }));
};

// Calculate component scores
const calculateComponentScores = (sittingPhase, risingPhase) => {
  const safeAverage = (scores, minRequired = 3) => {
    const validScores = scores.filter(
      (score) => !isNaN(score) && score !== null
    );
    return validScores.length >= minRequired
      ? average(validScores)
      : SCORE_CONFIG.DEFAULT_HIP_DRIVE;
  };

  // Enhanced postural control calculation
  const posturalControl = Math.max(
    0,
    Math.min(
      1,
      safeAverage([
        ...sittingPhase.map((p) => p.spinalAlignment.score * 1.3), // Increased weight
        ...risingPhase.map((p) => p.stability.score * 1.2),
      ])
    )
  );

  // Improved balance calculation
  const balance = Math.max(
    0,
    Math.min(
      1,
      safeAverage([
        ...sittingPhase.map((p) => p.hipControl.score * 1.4), // Increased weight
        ...risingPhase.map((p) => p.stability.score * 1.3),
      ])
    )
  );

  return {
    posturalControl,
    balance,
    coordination: Math.max(
      0,
      Math.min(
        1,
        safeAverage([
          ...sittingPhase.map((p) => p.kneeFlexion.score * 1.1),
          ...risingPhase.map((p) => p.kneeExtension.score * 1.1),
          ...risingPhase.map((p) => p.hipDrive.score * 1.2),
        ])
      )
    ),
  };
};

const calculatePhaseScores = (sittingPhase, risingPhase, supportPenalty) => {
  // Raw scores with higher minimums
  const rawSitScore = Math.max(
    SCORE_CONFIG.MIN_PHASE_SCORE, // Use 1.5 minimum
    (sittingPhase.kneeFlexion * 0.35 +
      sittingPhase.hipControl * 0.35 +
      sittingPhase.spinalAlignment * 0.3) *
      MAX_SCORE
  );

  const rawRiseScore = Math.max(
    SCORE_CONFIG.MIN_PHASE_SCORE, // Use 1.5 minimum
    (risingPhase.kneeExtension * 0.3 +
      risingPhase.hipDrive * 0.4 +
      risingPhase.stability * 0.3) *
      MAX_SCORE
  );

  // Apply reduced penalties
  const sitScore = Math.max(
    SCORE_CONFIG.MIN_PHASE_SCORE,
    Math.min(
      MAX_SCORE,
      rawSitScore - supportPenalty.sitting * SCORE_CONFIG.PENALTY_FACTOR
    )
  );

  const riseScore = Math.max(
    SCORE_CONFIG.MIN_PHASE_SCORE,
    Math.min(
      MAX_SCORE,
      rawRiseScore - supportPenalty.rising * SCORE_CONFIG.PENALTY_FACTOR
    )
  );

  return {
    sitScore: Number(sitScore.toFixed(2)),
    riseScore: Number(riseScore.toFixed(2)),
    totalScore: Number(Math.min(10, sitScore + riseScore).toFixed(2)),
  };
};

// Main analysis function
export const analyzeSRTVideo = async (videoPath) => {
  const startTime = performance.now();
  let frameProcessingTimes = [];

  try {
    const frames = await extractFramesFromVideo(videoPath);
    const detector = await initializeDetector();

    // Track frame processing time
    const poseAnalyses = await Promise.all(
      frames.map(async (frame) => {
        const frameStart = performance.now();
        const result = await analyzePoseInFrame(detector, frame);
        frameProcessingTimes.push(performance.now() - frameStart);
        return result;
      })
    );

    // Validate minimum frames requirement
    const minFramesPerPhase = 10;
    if (poseAnalyses.length < minFramesPerPhase * 2) {
      throw new Error(
        "Insufficient frames for analysis. Minimum required: " +
          minFramesPerPhase * 2
      );
    }

    // Detect transition point between sitting and rising phases
    const transitionFrame = detectPhaseTransition(poseAnalyses);

    // Analyze phases with proper frame selection
    const sittingPhase = analyzeSittingPhase(
      poseAnalyses.slice(0, Math.max(minFramesPerPhase, transitionFrame))
    );
    const risingPhase = analyzeRisingPhase(
      poseAnalyses.slice(
        Math.min(poseAnalyses.length - minFramesPerPhase, transitionFrame)
      )
    );

    // Detect support points and calculate penalties
    const supportPoints = poseAnalyses.map(detectSupportPoints);
    const supportPenalty = calculateSupportPenalty(supportPoints);

    // Calculate component scores with safety checks
    const componentScores = calculateComponentScores(sittingPhase, risingPhase);

    // Calculate normalized sitting phase scores
    const sittingScores = {
      kneeFlexion: safeScore(
        average(sittingPhase.map((p) => p.kneeFlexion.score))
      ),
      hipControl: safeScore(
        average(sittingPhase.map((p) => p.hipControl.score))
      ),
      spinalAlignment: safeScore(
        average(sittingPhase.map((p) => p.spinalAlignment.score))
      ),
    };

    // Calculate normalized rising phase scores
    const risingScores = {
      kneeExtension: safeScore(
        average(risingPhase.map((p) => p.kneeExtension.score))
      ),
      hipDrive: safeScore(average(risingPhase.map((p) => p.hipDrive.score))),
      stability: safeScore(average(risingPhase.map((p) => p.stability.score))),
    };

    // Calculate raw phase scores with weighted components
    const rawSitScore = safeScore(
      (sittingScores.kneeFlexion * 0.35 +
        sittingScores.hipControl * 0.35 +
        sittingScores.spinalAlignment * 0.3) *
        MAX_SCORE,
      1
    );

    const rawRiseScore = safeScore(
      (risingScores.kneeExtension * 0.3 +
        risingScores.hipDrive * 0.4 +
        risingScores.stability * 0.3) *
        MAX_SCORE,
      1
    );

    // Apply penalties and ensure minimum scores
    const sitScore = Math.max(
      1,
      Math.min(MAX_SCORE, rawSitScore - supportPenalty.sitting * 0.8)
    );

    const riseScore = Math.max(
      1,
      Math.min(MAX_SCORE, rawRiseScore - supportPenalty.rising * 0.8)
    );

    // Calculate total score with bounds checking
    const totalScore = Math.max(2, Math.min(10, sitScore + riseScore));

    const scores = calculatePhaseScores(
      sittingScores,
      risingScores,
      supportPenalty
    );

    // Generate detailed feedback
    const feedback = generateDetailedFeedback(
      sittingScores,
      risingScores,
      componentScores,
      supportPoints
    );

    // Calculate performance metrics
    const totalTime = performance.now() - startTime;
    const avgFrameTime = average(frameProcessingTimes);

    // Log performance warnings if needed
    if (avgFrameTime > 500 || totalTime > 30000) {
      console.warn("Performance Warning:", {
        averageFrameTime: `${avgFrameTime.toFixed(2)}ms`,
        totalAnalysisTime: `${totalTime.toFixed(2)}ms`,
        frameCount: frames.length,
      });
    }

    // Return comprehensive analysis results
    return {
      ...scores, // This will include sitScore, riseScore, and totalScore
      ...componentScores,
      sittingPhase: sittingScores,
      risingPhase: risingScores,
      feedback,
      keyFrames: frames,
      processingStatus: "completed",
      supportPointsUsed: supportPoints,
      performance: {
        totalTime: `${totalTime.toFixed(2)}ms`,
        averageFrameTime: `${avgFrameTime.toFixed(2)}ms`,
        frameCount: frames.length,
        transitionFrame,
      },
    };
  } catch (error) {
    console.error("Error in SRT analysis:", error);
    throw new Error("Failed to analyze video");
  }
};

const calculateSupportPenalty = (supportPoints) => {
  const sittingSupports = supportPoints.slice(0, supportPoints.length / 2);
  const risingSupports = supportPoints.slice(supportPoints.length / 2);

  const calculatePhasePenalty = (phaseSupports) => {
    let penalty = 0;
    const uniqueSupports = new Set(phaseSupports.flat());

    if (uniqueSupports.has("HAND")) penalty += SUPPORT_PENALTIES.HAND;
    if (uniqueSupports.has("KNEE")) penalty += SUPPORT_PENALTIES.KNEE;

    return penalty;
  };

  return {
    sitting: calculatePhasePenalty(sittingSupports),
    rising: calculatePhasePenalty(risingSupports),
  };
};

// Enhanced feedback generation
const generateDetailedFeedback = (
  sittingScores,
  risingScores,
  componentScores,
  supportPoints
) => {
  const feedback = {
    strengths: [],
    improvements: [],
    recommendations: [],
  };

  // More nuanced feedback thresholds
  const EXCELLENT_THRESHOLD = 0.8;
  const GOOD_THRESHOLD = 0.6;
  const IMPROVEMENT_THRESHOLD = 0.4;

  // Sitting phase feedback
  if (sittingScores.kneeFlexion > EXCELLENT_THRESHOLD) {
    feedback.strengths.push("Excellent knee control during sitting");
  } else if (sittingScores.kneeFlexion < IMPROVEMENT_THRESHOLD) {
    feedback.improvements.push("Work on controlled descent while sitting");
    feedback.recommendations.push(
      "Practice slow, controlled squats with proper form"
    );
  }

  // Rising phase feedback with more specific criteria
  if (risingScores.hipDrive > EXCELLENT_THRESHOLD) {
    feedback.strengths.push("Strong hip drive during rising");
  } else if (risingScores.hipDrive < IMPROVEMENT_THRESHOLD) {
    feedback.improvements.push("Need to improve hip drive strength");
    feedback.recommendations.push(
      "Practice hip thrust exercises to build strength"
    );
  }

  // Balance feedback with refined thresholds
  if (componentScores.balance < GOOD_THRESHOLD) {
    if (componentScores.balance < IMPROVEMENT_THRESHOLD) {
      feedback.improvements.push("Significant balance improvement needed");
      feedback.recommendations.push(
        "Start with supported single-leg stance exercises"
      );
    } else {
      feedback.improvements.push("Balance needs some improvement");
      feedback.recommendations.push("Practice single-leg standing exercises");
    }
  }

  // Postural control feedback with context
  if (componentScores.posturalControl < GOOD_THRESHOLD) {
    if (sittingScores.spinalAlignment < IMPROVEMENT_THRESHOLD) {
      feedback.improvements.push("Focus on maintaining spinal alignment");
      feedback.recommendations.push(
        "Practice wall sits with proper back alignment"
      );
    } else {
      feedback.improvements.push("Work on maintaining better posture");
      feedback.recommendations.push(
        "Practice plank exercises for core strength"
      );
    }
  }

  // Support point feedback
  const uniqueSupports = new Set(supportPoints.flat());
  if (uniqueSupports.size === 0) {
    feedback.strengths.push("Excellent form - no supports needed");
  } else {
    const supportTypes = Array.from(uniqueSupports);
    feedback.improvements.push(
      `Used ${supportTypes.join(" and ")} for support`
    );
    feedback.recommendations.push(
      supportTypes.includes("HAND")
        ? "Practice the movement with arms crossed over chest"
        : "Practice the movement without knee support"
    );
  }

  return feedback;
};
