const ResultSchema = new mongoose.Schema({
  userId: String,
  timestamp: { type: Date, default: Date.now },
  sittingScore: Number,
  risingScore: Number,
  totalScore: Number,
  feedback: [String],
  videoPath: String,
});

const Result = mongoose.model("Result", ResultSchema);
