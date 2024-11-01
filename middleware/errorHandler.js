export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      status: "error",
      message: "Validation error",
      details: err.message,
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      status: "error",
      message: "File upload error",
      details: err.message,
    });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      status: "error",
      message: "File too large",
    });
  }

  // Default error response
  return res.status(500).json({
    status: "error",
    message: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};
