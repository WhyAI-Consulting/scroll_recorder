const express = require("express");
const videoController = require("../controllers/videoController");

const router = express.Router();

router.post("/generate-background", videoController.generateBackground);

module.exports = router;
