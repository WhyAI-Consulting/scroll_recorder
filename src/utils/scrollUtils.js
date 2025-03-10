function calculateScrollDuration(pageHeight, scrollSpeed) {
  const baseDuration = pageHeight / 1000; // Base speed: 1000px per second
  switch (scrollSpeed) {
    case "fast":
      return baseDuration * 5;
    case "medium":
      return baseDuration * 10;
    case "slow":
      return baseDuration * 20;
    default:
      throw new Error("Invalid scrollSpeed");
  }
}

module.exports = { calculateScrollDuration };
