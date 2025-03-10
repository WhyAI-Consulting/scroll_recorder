const videoService = require("../services/videoService");

// Get the base URL from environment variable or use a default
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const generateBackground = async (req, res) => {
  console.log("Received request to generate background video:", req.body);

  const {
    url,
    scrollSpeed,
    resolution = "1920x1080",
    scrollDirection = "down",
    hideElements = [],
    duration,
  } = req.body;

  if (!url || !scrollSpeed) {
    console.log("Missing required parameters: url or scrollSpeed");
    return res.status(400).json({ error: "URL and scrollSpeed are required" });
  }
  if (!["fast", "medium", "slow"].includes(scrollSpeed)) {
    console.log(`Invalid scrollSpeed: ${scrollSpeed}`);
    return res
      .status(400)
      .json({ error: "scrollSpeed must be fast, medium, or slow" });
  }
  if (!["down", "up", "loop"].includes(scrollDirection)) {
    console.log(`Invalid scrollDirection: ${scrollDirection}`);
    return res
      .status(400)
      .json({ error: "scrollDirection must be down, up, or loop" });
  }
  if (duration && (typeof duration !== "number" || duration <= 0)) {
    console.log(`Invalid duration: ${duration}`);
    return res
      .status(400)
      .json({ error: "Duration must be a positive number in seconds" });
  }

  try {
    console.log("Calling videoService.generateVideo with parameters:", {
      url,
      scrollSpeed,
      resolution,
      scrollDirection,
      hideElements,
      duration,
    });

    const videoUrl = await videoService.generateVideo(
      url,
      scrollSpeed,
      resolution,
      scrollDirection,
      hideElements,
      duration
    );

    console.log(`Video generated and uploaded successfully: ${videoUrl}`);
    res.json({ videoUrl });
  } catch (error) {
    console.error("Error generating video:", error);
    res.status(500).json({
      error: "Failed to generate video",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

module.exports = { generateBackground };
