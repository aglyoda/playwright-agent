const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.post("/run-ui-workflow", async (req, res) => {
    const startTime = Date.now();
  // API Key protection
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const payload = req.body;

  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      httpCredentials: {
        username: process.env.BASIC_AUTH_USER || "demo",
        password: process.env.BASIC_AUTH_PASS || "Trade#2468"
      }
    });

    const page = await context.newPage();

    // Debug failed network calls
    page.on("response", (response) => {
      if (!response.ok()) {
        console.log("Failed:", response.url(), response.status());
      }
    });

    // Capture trade creation response
    const tradeResponsePromise = page.waitForResponse((res) =>
      res.url().includes("/api/trades") &&
      res.request().method() === "POST"
    );

    // Navigate
    await page.goto("https://trade-workflow-basic.vercel.app", {
      waitUntil: "networkidle"
    });

    await page.waitForSelector("#f-symbol", { timeout: 60000 });

    // Fill form
    await page.fill("#f-symbol", payload.symbol);
    await page.fill("#f-qty", String(payload.quantity));
    await page.selectOption("#f-side", payload.side);
    await page.fill("#f-cp", payload.counterparty);

    console.log("Submitting trade...");

    await page.click('button[type="submit"]');

    // Get tradeId from backend response
    const tradeResponse = await tradeResponsePromise;
    const tradeData = await tradeResponse.json();

    const tradeId = tradeData.trade_id;
    console.log("Trade created:", tradeId);

    // Wait for row to appear in UI
    const myRow = page.locator(`#trade-tbody tr:has-text("${tradeId}")`);
    await myRow.waitFor({ timeout: 60000 });

    const myRowText = await myRow.innerText();

    // Screenshot 1: Table
    const tableScreenshot = `/tmp/${tradeId}-table.png`;
    await page.screenshot({ path: tableScreenshot });
      const tableUpload = await cloudinary.uploader.upload(tableScreenshot, {
  folder: "trade-workflow",
  public_id: `${tradeId}-table`
});

    // Click "View JSON" for THIS row
    const viewJsonButton = myRow.locator("text=View JSON");
    await viewJsonButton.click();

    // Small wait for modal/render
    await page.waitForTimeout(1000);

    // Screenshot 2: JSON view
    const jsonScreenshot = `/tmp/${tradeId}-json.png`;
    await page.screenshot({ path: jsonScreenshot });
      const jsonUpload = await cloudinary.uploader.upload(jsonScreenshot, {
  folder: "trade-workflow",
  public_id: `${tradeId}-json`
});

    const endTime = Date.now(); 
    const executionTime = endTime - startTime;

      fs.unlinkSync(tableScreenshot);
fs.unlinkSync(jsonScreenshot);

    return res.json({
      success: true,
      tradeId,
      row: myRowText,
      tableScreenshot: tableUpload.secure_url,
  jsonScreenshot: jsonUpload.secure_url,
      executionTimeMs: executionTime
    });

  } catch (err) {
     const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.error("ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
      executionTimeMs: executionTime
    });

  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
