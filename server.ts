import "dotenv/config";
import express from "express";

const app = express();
const PORT = 3001;

const LTA_URL =
  "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2";

app.get("/api/carpark-availability", async (_req, res) => {
  const accountKey = process.env.LTA_ACCOUNT_KEY;

  if (!accountKey) {
    res.status(500).json({ error: "LTA API key is not configured." });
    return;
  }

  try {
    const records: unknown[] = [];
    let skip = 0;

    while (true) {
      const response = await fetch(`${LTA_URL}?$skip=${skip}`, {
        headers: {
          AccountKey: accountKey,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error("LTA API returned status:", response.status);
        res.status(response.status === 429 ? 429 : 502).json({
          error: "Unable to retrieve carpark data from LTA.",
        });
        return;
      }

      const data = (await response.json()) as {
        value?: unknown[];
      };

      const page = data.value ?? [];
      records.push(...page);

      if (page.length < 500) break;

      skip += page.length;
    }

    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({
      value: records,
      count: records.length,
      source: "LTA DataMall",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Carpark API request failed:", error);
    res.status(502).json({
      error: "Could not connect to LTA DataMall. Please try again.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Parkly API running at http://localhost:${PORT}`);
});
