const analysisSchema = new mongoose.Schema(
  {
    videoUrl: String,
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    scores: {
      sitting: {
        type: Number,
        default: 5,
      },
      rising: {
        type: Number,
        default: 5,
      },
      total: Number,
    },
    deductions: [
      {
        type: {
          type: String,
          enum: ["hand", "knee", "elbow", "side", "balance"],
        },
        points: Number,
        phase: {
          type: String,
          enum: ["sitting", "rising"],
        },
        timestamp: Number,
      },
    ],
    recommendations: [
      {
        area: String,
        exercises: [String],
        priority: {
          type: String,
          enum: ["low", "medium", "high"],
        },
      },
    ],
    riskLevel: {
      type: String,
      enum: ["low", "moderate", "high"],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Analysis", analysisSchema);
