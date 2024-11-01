// server/controllers/srtController.js
import { analyzeSRTVideo } from "../services/tensorflowService.js";
import { SRTResult } from "../models.js";
import { cleanupFrames } from "../services/videoService.js";

export const analyzeVideo = async (req, res, next) => {
  try {
    const videoPath = req.file.path;

    // First, analyze the video before creating the record
    const analysis = await analyzeSRTVideo(videoPath);

    console.log(analysis);

    // Create record with all required fields from analysis
    let result = new SRTResult({
      // Basic scores with fallback to 0 if NaN
      sitScore: isNaN(analysis.sitScore) ? 0 : Math.max(0, analysis.sitScore),
      riseScore: isNaN(analysis.riseScore)
        ? 0
        : Math.max(0, analysis.riseScore),
      totalScore: isNaN(analysis.totalScore)
        ? 0
        : Math.max(0, analysis.totalScore),

      // Detailed analysis with fallback to 0
      posturalControl: isNaN(analysis.posturalControl)
        ? 0
        : Math.max(0, analysis.posturalControl),
      balance: isNaN(analysis.balance) ? 0 : Math.max(0, analysis.balance),
      coordination: isNaN(analysis.coordination)
        ? 0
        : Math.max(0, analysis.coordination),

      // Movement phases with fallback to 0
      sittingPhase: {
        kneeFlexion: isNaN(analysis.sittingPhase.kneeFlexion)
          ? 0
          : Math.max(0, analysis.sittingPhase.kneeFlexion),
        hipControl: isNaN(analysis.sittingPhase.hipControl)
          ? 0
          : Math.max(0, analysis.sittingPhase.hipControl),
        spinalAlignment: isNaN(analysis.sittingPhase.spinalAlignment)
          ? 0
          : Math.max(0, analysis.sittingPhase.spinalAlignment),
      },
      risingPhase: {
        kneeExtension: isNaN(analysis.risingPhase.kneeExtension)
          ? 0
          : Math.max(0, analysis.risingPhase.kneeExtension),
        hipDrive: isNaN(analysis.risingPhase.hipDrive)
          ? 0
          : Math.max(0, analysis.risingPhase.hipDrive),
        stability: isNaN(analysis.risingPhase.stability)
          ? 0
          : Math.max(0, analysis.risingPhase.stability),
      },

      // Feedback and media
      feedback: analysis.feedback,
      videoPath: videoPath,
      keyFrames: analysis.keyFrames,
      processingStatus: "completed",
    });

    await result.save();

    // Cleanup temporary frame files
    if (analysis.keyFrames) {
      try {
        await cleanupFrames(analysis.keyFrames);
      } catch (cleanupError) {
        console.warn("Frame cleanup warning:", cleanupError);
      }
    }

    res.json({
      success: true,
      reportId: result._id,
      data: {
        sitScore: result.sitScore,
        riseScore: result.riseScore,
        totalScore: result.totalScore,
        posturalControl: result.posturalControl,
        balance: result.balance,
        coordination: result.coordination,
        feedback: result.feedback,
      },
    });
  } catch (error) {
    // If analysis fails, create a failed record
    try {
      const failedResult = new SRTResult({
        videoPath: req.file.path,
        sitScore: 0,
        riseScore: 0,
        totalScore: 0,
        posturalControl: 0,
        balance: 0,
        coordination: 0,
        processingStatus: "failed",
      });
      await failedResult.save();
    } catch (saveError) {
      console.error("Error saving failed result:", saveError);
    }

    next(error);
  }
};

export const getReport = async (req, res, next) => {
  const { id } = req.params;

  // Check if id is provided
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Report ID is required",
    });
  }

  try {
    const result = await SRTResult.findById(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // Making response structure exactly match analyzeVideo
    res.json({
      success: true,
      reportId: result._id,
      data: {
        sitScore: result.sitScore,
        riseScore: result.riseScore,
        totalScore: result.totalScore,
        posturalControl: result.posturalControl,
        balance: result.balance,
        coordination: result.coordination,
        feedback: result.feedback,
      },
    });
  } catch (error) {
    console.error("Error in getReport:", error);
    next(error);
  }
};
