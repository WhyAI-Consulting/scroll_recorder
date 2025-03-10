const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { calculateScrollDuration } = require("../utils/scrollUtils");
const { uploadToS3 } = require("./storageService");

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create temporary videos directory if it doesn't exist
const videosDir = path.join(__dirname, "../../temp_videos");
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}

// Common cookie popup selectors and button texts
const COOKIE_SELECTORS = {
  // Common class names and IDs
  selectors: [
    "#cookiebot",
    ".cookiebot",
    "#cookiebanner",
    ".cookie-banner",
    ".cookie-notice",
    ".cookie-popup",
    ".cookie-consent",
    '[aria-label*="cookie"]',
    '[id*="cookie"]',
    '[class*="cookie"]',
    ".cc-window",
    ".CookieConsent",
  ],
  // Common button texts
  buttonTexts: [
    "Accept",
    "Accept all",
    "Accept cookies",
    "Allow cookies",
    "Allow all cookies",
    "OK",
    "Got it",
    "I understand",
    "Close",
    // German translations
    "Akzeptieren",
    "Alle akzeptieren",
    "Cookies zulassen",
    "Verstanden",
    "Schließen",
    "Nur notwendige Cookies",
    "Cookies akzeptieren",
  ],
};

// Simple logging function
function log(message, type = "info") {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;

  console.log(logMessage);

  // Also write to log file
  fs.appendFileSync(path.join(logsDir, "video-service.log"), logMessage);
}

async function handleCookiePopups(page) {
  log("Attempting to handle cookie popups...");

  try {
    // Wait a bit for cookie popups to appear
    await page.waitForTimeout(2000);

    // Try clicking buttons by their text content
    for (const buttonText of COOKIE_SELECTORS.buttonTexts) {
      try {
        const button = await page.getByRole("button", {
          name: new RegExp(buttonText, "i"),
        });
        if ((await button.count()) > 0) {
          // Wait for potential navigation after clicking
          await Promise.all([
            // Create a promise that will resolve on navigation or timeout after 5 seconds
            Promise.race([
              page
                .waitForNavigation({ waitUntil: "networkidle" })
                .catch(() => {}),
              page.waitForTimeout(5000),
            ]),
            button.click(),
          ]);
          log(`Clicked cookie button with text: ${buttonText}`);
          // Wait for page to stabilize
          await page.waitForLoadState("networkidle");
          return true;
        }
      } catch (e) {
        // Continue to next button text if this one fails
      }
    }

    // Try clicking elements by selectors
    for (const selector of COOKIE_SELECTORS.selectors) {
      try {
        // Look for buttons or interactive elements within cookie-related containers
        const elements = await page.locator(
          `${selector} button, ${selector} [role="button"], ${selector} a[href="#"], ${selector} [type="button"]`
        );
        if ((await elements.count()) > 0) {
          // Wait for potential navigation after clicking
          await Promise.all([
            Promise.race([
              page
                .waitForNavigation({ waitUntil: "networkidle" })
                .catch(() => {}),
              page.waitForTimeout(5000),
            ]),
            elements.first().click(),
          ]);
          log(`Clicked cookie element with selector: ${selector}`);
          // Wait for page to stabilize
          await page.waitForLoadState("networkidle");
          return true;
        }
      } catch (e) {
        // Continue to next selector if this one fails
      }
    }

    // Try finding and clicking the "necessary cookies only" option if available
    try {
      const necessaryOnly = await page.getByRole("button", {
        name: /nur.+notwendige/i,
      });
      if ((await necessaryOnly.count()) > 0) {
        // Wait for potential navigation after clicking
        await Promise.all([
          Promise.race([
            page
              .waitForNavigation({ waitUntil: "networkidle" })
              .catch(() => {}),
            page.waitForTimeout(5000),
          ]),
          necessaryOnly.click(),
        ]);
        log("Clicked 'necessary cookies only' button");
        // Wait for page to stabilize
        await page.waitForLoadState("networkidle");
        return true;
      }
    } catch (e) {
      // Continue if this approach fails
    }

    log("No cookie popups found or handled");
    return false;
  } catch (error) {
    log(`Warning: Error handling cookie popups: ${error.message}`);
    return false;
  }
}

async function waitNoMutations(page, selector) {
  return await page.evaluateHandle(function (selector) {
    var list = document.querySelectorAll(selector);
    var elements = [].slice.call(list);
    var config = { attributes: true, childList: true, subtree: true };
    var mutations = 5; // wait at least five intervals
    var observer = new MutationObserver(function () {
      mutations += 1;
    });
    elements.forEach(function (target) {
      observer.observe(target, config);
    });
    var decrementInterval = setInterval(function () {
      mutations -= 1;
      if (mutations <= 0) {
        clearInterval(decrementInterval);
      }
    }, 5); // this quant might be reduced?
    function complete() {
      return mutations <= 0;
    }
    return new Promise(function (resolve) {
      var count = 0;
      var completeInterval = setInterval(function () {
        if (count >= 1000) {
          // timeout?
          clearInterval(completeInterval);
          observer.disconnect();
          resolve("timeout");
          return;
        }
        if (complete()) {
          clearInterval(completeInterval);
          observer.disconnect();
          resolve(true);
          return;
        }
        count += 1;
      }, 5);
    });
  }, selector);
}

async function generateVideo(
  url,
  scrollSpeed,
  resolution,
  scrollDirection,
  hideElements,
  duration
) {
  log(`Starting video generation for URL: ${url}`);
  log(
    `Parameters: scrollSpeed=${scrollSpeed}, resolution=${resolution}, scrollDirection=${scrollDirection}, hideElements=${JSON.stringify(
      hideElements
    )}, duration=${duration}`
  );

  let browser;
  let setupContext;
  let recordingContext;

  try {
    const [width, height] = resolution.split("x").map(Number);
    log(`Launching browser with viewport ${width}x${height}`);

    browser = await chromium.launch();
    log("Browser launched successfully");

    // First create a context without video recording to handle cookies
    setupContext = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
      serviceWorkers: "block", // Prevent service workers from interfering
    });

    const setupPage = await setupContext.newPage();
    log("Setup page created");

    // Set a longer timeout for navigation
    setupPage.setDefaultTimeout(30000);
    setupPage.setDefaultNavigationTimeout(30000);

    log(`Navigating to ${url}`);
    await setupPage.goto(url, { waitUntil: "networkidle" });
    log("Page loaded successfully");

    // Handle cookie popups before proceeding
    await handleCookiePopups(setupPage);

    // Additional wait to ensure page is stable after cookie handling
    await setupPage.waitForLoadState("networkidle");

    await setupPage.waitForTimeout(2000); // Increased wait time for stability

    // Get storage state BEFORE closing the setup context
    const storageState = await setupContext.storageState();
    log("Stored cookie state");

    // Now we can safely close the setup context
    await setupContext.close();
    log("Setup context closed");

    // Now create a new context with video recording
    recordingContext = await browser.newContext({
      viewport: { width, height },
      recordVideo: {
        dir: videosDir,
        size: { width, height },
      },
      // Use the previously captured storage state
      storageState: storageState,
    });
    log("Recording context created with video recording enabled");

    const page = await recordingContext.newPage();
    log("Recording page created");

    // Navigate to the page again - it should now use stored cookies
    log(`Navigating to ${url} for recording`);
    await page.goto(url, { waitUntil: "networkidle" });
    log("Page loaded for recording");

    // Wait for the page to stabilize after loading
    log("Waiting for page to stabilize...");
    await waitNoMutations(page, "body");
    log("Page stabilized, starting recording");

    // Wait for 2 seconds before starting the scroll
    await page.waitForTimeout(2000);
    log("Waited 2 seconds before starting scroll");

    if (hideElements.length > 0) {
      log(`Hiding elements: ${JSON.stringify(hideElements)}`);
      for (const selector of hideElements) {
        try {
          await page.evaluate((sel) => {
            document
              .querySelectorAll(sel)
              .forEach((el) => (el.style.display = "none"));
          }, selector);
        } catch (error) {
          log(
            `Warning: Could not hide element with selector ${selector}: ${error.message}`
          );
        }
      }
      log("Elements hidden successfully");
    }

    log("Calculating page height");
    const pageHeight = await page.evaluate(
      () => document.documentElement.scrollHeight
    );
    log(`Page height: ${pageHeight}px`);

    const finalDuration =
      duration || calculateScrollDuration(pageHeight, scrollSpeed);
    log(`Final video duration: ${finalDuration} seconds`);

    log("Starting scroll recording");
    const fps = 60;
    const maxScrollPerFrame = 50;
    const totalFrames = finalDuration * fps;
    const maxScrollDistance = maxScrollPerFrame * totalFrames;
    const scrollableHeight = Math.min(pageHeight, maxScrollDistance);
    const scrollStep = scrollableHeight / totalFrames;

    let currentPosition = scrollDirection === "up" ? pageHeight : 0;
    const startTime = Date.now();

    while (Date.now() - startTime < finalDuration * 1000) {
      if (scrollDirection === "down") {
        currentPosition += scrollStep;
      } else if (scrollDirection === "up") {
        currentPosition -= scrollStep;
      } else if (scrollDirection === "loop") {
        currentPosition += scrollStep;
        if (currentPosition >= scrollableHeight) currentPosition = 0;
      }

      await page.evaluate(
        (pos) => window.scrollTo(0, pos),
        Math.min(Math.max(currentPosition, 0), pageHeight)
      );
      await page.waitForTimeout(1000 / fps);
    }

    log("Scroll recording completed");

    // Close the context to finish the video
    const localVideoPath = await page.video().path();
    await recordingContext.close();
    log("Recording context closed, video saved");

    await browser.close();
    log("Browser closed");

    // Add a small delay to ensure file is fully written
    log("Waiting for video file to be fully written...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify file exists and is readable
    if (!fs.existsSync(localVideoPath)) {
      throw new Error(`Video file not found at: ${localVideoPath}`);
    }

    const stats = fs.statSync(localVideoPath);
    log(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Upload to S3 and get signed URL
    log("Uploading video to S3...");
    const { url: signedUrl } = await uploadToS3(localVideoPath);
    log("Video uploaded to S3 successfully");

    return signedUrl;
  } catch (error) {
    log(`Error in generateVideo: ${error.message}`, "error");
    log(error.stack, "error");

    // Clean up in reverse order
    if (recordingContext) {
      try {
        await recordingContext.close();
        log("Recording context closed after error");
      } catch (closeError) {
        log(`Error closing recording context: ${closeError.message}`, "error");
      }
    }

    if (setupContext) {
      try {
        await setupContext.close();
        log("Setup context closed after error");
      } catch (closeError) {
        log(`Error closing setup context: ${closeError.message}`, "error");
      }
    }

    if (browser) {
      try {
        await browser.close();
        log("Browser closed after error");
      } catch (closeError) {
        log(`Error closing browser: ${closeError.message}`, "error");
      }
    }

    throw error;
  }
}

module.exports = { generateVideo };
