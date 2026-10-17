const LTA_URL =
  "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2";

interface Env {
  LTA_ACCOUNT_KEY: string;
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (!env.LTA_ACCOUNT_KEY) {
    return Response.json(
      { error: "LTA API key is not configured." },
      { status: 500 },
    );
  }

  try {
    const records: unknown[] = [];
    let skip = 0;

    while (true) {
      const response = await fetch(`${LTA_URL}?$skip=${skip}`, {
        headers: {
          AccountKey: env.LTA_ACCOUNT_KEY,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error("LTA API returned status:", response.status);

        return Response.json(
          { error: "Unable to retrieve carpark data from LTA." },
          { status: response.status === 429 ? 429 : 502 },
        );
      }

      const data = (await response.json()) as { value?: unknown[] };
      const page = data.value ?? [];

      records.push(...page);

      if (page.length < 500) break;

      skip += page.length;
    }

    return Response.json(
      {
        value: records,
        count: records.length,
        source: "LTA DataMall",
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30",
        },
      },
    );
  } catch (error) {
    console.error("Carpark API request failed:", error);

    return Response.json(
      { error: "Could not connect to LTA DataMall. Please try again." },
      { status: 502 },
    );
  }
}
