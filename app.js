const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json());

app.post("/run-ui-workflow", async (req, res) => {
  const payload = req.body;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://trade-workflow-basic.vercel.app");

    // Fill form
    await page.fill("#f-symbol", payload.symbol);
    await page.fill("#f-qty", String(payload.quantity));
    await page.selectOption("#f-side", payload.side);
    await page.fill("#f-cp", payload.counterparty);

    // Submit
    await page.click('button[type="submit"]');

    // Wait for table update
    await page.waitForSelector("#trade-tbody tr");

    const tableText = await page.locator("#trade-tbody").innerText();

    // Extract tradeId
    const match = tableText.match(/T\d+/);
    const tradeId = match ? match[0] : null;

    await browser.close();

    return res.json({
      success: true,
      tradeId,
      tableText
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Render uses this port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});