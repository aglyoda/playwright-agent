const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json());

app.post("/run-ui-workflow", async (req, res) => {
  const payload = req.body;

  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      httpCredentials: {
        username: process.env.BASIC_AUTH_USER,
        password: process.env.BASIC_AUTH_PASS
      }
    });

    const page = await context.newPage();

    // Debug failed requests
    page.on("response", (response) => {
      if (!response.ok()) {
        console.log("Failed:", response.url(), response.status());
      }
    });

    // Capture trade creation API response
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

    // Get tradeId from network
    const tradeResponse = await tradeResponsePromise;
    const tradeData = await tradeResponse.json();

    const tradeId = tradeData.trade_id;
    console.log("Trade created:", tradeId);

    // Wait for UI update
    await page.waitForSelector("#trade-tbody", { timeout: 60000 });

    // Wait until OUR trade appears
    const myRow = page.locator(`#trade-tbody tr:has-text("${tradeId}")`);
    await myRow.waitFor({ timeout: 60000 });

    const myRowText = await myRow.innerText();

    // Screenshot 1 → table
    const tableScreenshot = `/tmp/${tradeId}-table.png`;
    await page.screenshot({ path: tableScreenshot });

    // Click "View JSON" for THIS row only
    const viewJsonButton = myRow.locator('text=View JSON');
    await viewJsonButton.click();

    // Wait for JSON to appear (adjust selector if needed)
    await page.waitForTimeout(1000);

    // Screenshot 2 → JSON view
    const jsonScreenshot = `/tmp/${tradeId}-json.png`;
    await page.screenshot({ path: jsonScreenshot });

    return res.json({
      success: true,
      tradeId,
      row: myRowText,
      tableScreenshot,
      jsonScreenshot
    });

  } catch (err) {
    console.error("ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message
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
