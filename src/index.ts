import { Prisma, PrismaClient } from "@prisma/client";
import express from "express";
import { v4 as uuidv4 } from "uuid"; // For generating unique identifiers
import _ from "lodash"; // pastikan install lodash
import { DateTime } from "luxon";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

interface LogData {
  sample: number;
  I: number;
  timestamp: Date | string;
  identifier: string; // Unique identifier for the batch
}

interface IndicatorData {
  id: number;
  I: number;
  motor: string;
}

app.post("/arus/:indicator_id", async (req, res) => {
  const data: Omit<LogData, "timestamp">[] = req.body;

  if (!Array.isArray(data)) {
    res.status(400).json({ error: "Invalid format, expected an array." });
    return;
  }

  console.log("Received data:", data);

  if (!data.find((entry) => entry.I >= 400)) {
    res.status(200).json({ message: "No data with I > 400 found." });
    return;
  }

  const uniqueHash = uuidv4();

  // Get the base timestamp in Asia/Jakarta timezone
  const nowJakarta = DateTime.now().setZone("Asia/Jakarta");

  const preparedData = data.map((entry, index, arr) => ({
    sample: entry.sample,
    i: entry.I,
    timestamp: nowJakarta
      .minus({ seconds: arr.length - index - 1 })
      .toISO() as string, // Convert Luxon to JS Date
    identifier: uniqueHash,
    indicator_id: parseInt(req.params.indicator_id, 10),
  }));

  await prisma.log.createMany({
    data: preparedData,
  });

  res.status(201).json({
    message: "Data received successfully",
  });
});

app.get("/arus/:indicator_id", async (req, res) => {
  const rawLogs = await prisma.log.findMany({
    where: {
      i: {
        gte: 400,
      },
      indicator_id: parseInt(req.params.indicator_id, 10),
    },
    orderBy: {
      timestamp: "asc",
    },
  });

  // Group by identifier dan ambil log pertama per group (karena sudah di-sort)
  const grouped = _(rawLogs)
    .groupBy("identifier")
    .map((logs) => ({
      id: logs[0].identifier,

      timestamp: DateTime.fromJSDate(logs[0].timestamp)
        .setZone("Asia/Jakarta")
        .toISO(),
    }))
    .value();

  const indicators = await prisma.indicator.findUnique({
    where: {
      id: parseInt(req.params.indicator_id, 10),
    },
  });

  const formatedIndicators = {
    id: indicators?.id || 0,
    i: indicators?.i || 0,
    motor: indicators?.motor || 0,
    updatedAt: indicators?.updatedAt
      ? DateTime.fromJSDate(indicators.updatedAt)
          .setZone("Asia/Jakarta")
          .toISO()
      : null,
  };

  res.status(200).json({
    status: formatedIndicators,
    arus: grouped,
  });
});

app.get("/arus/:indicator_id/:identifier", async (req, res) => {
  const { identifier } = req.params;
  if (!identifier) {
    res.status(400).json({ error: "Identifier is required" });
    return;
  }

  try {
    const logs = await prisma.log.findMany({
      where: { identifier, indicator_id: parseInt(req.params.indicator_id, 10) },
      orderBy: { timestamp: "asc" }, // Sort by timestamp in ascending order
    });

    if (logs.length === 0) {
      res.status(404).json({ error: "No logs found for this identifier" });
      return;
    }

    const formattedLogs = logs.map((log) => ({
      sample: log.sample,
      i: log.i,
      motor: log.motor,
      timestamp: DateTime.fromJSDate(log.timestamp)
        .setZone("Asia/Jakarta")
        .toISO(), // Format timestamp to ISO string in Asia/Jakarta timezone
      id: log.identifier,
    }));

    res.status(200).json({
      data: formattedLogs,
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

app.post("/indicator", async (req, res) => {
  const data: IndicatorData[] = req.body;

  if (!Array.isArray(data) || data.length === 0) {
    res
      .status(400)
      .json({ error: "Invalid format, expected an array of indicators." });
    return;
  }

  try {
    // Ambil waktu sekarang di zona Asia/Jakarta
    const now = DateTime.now().setZone("Asia/Jakarta").toISO() as string;

    const updatedIndicators = await Promise.all(
      data.map(async (indicator) => {
        await prisma.indicator.upsert({
          where: { id: indicator.id },
          update: { i: indicator.I, motor: indicator.motor, updatedAt: now },
          create: {
            id: indicator.id,
            i: indicator.I,
            motor: indicator.motor,
            updatedAt: now,
          },
        });

        return {
          id: indicator.id,
          i: indicator.I,
          motor: indicator.motor,
          updatedAt: now,
        };
      })
    );

    res.status(200).json({
      message: "Indicator updated successfully",
      data: updatedIndicators,
    });
  } catch (error) {
    console.error("Error updating indicator:", error);
    res.status(500).json({ error: "Failed to update indicator" });
  }
});

// app.get("/indicator", async (req, res) => {
//   try {
//     const indicators = await prisma.indicator.findMany({
//       orderBy: {
//         id: "asc", // Sort by ID in ascending order
//       },
//     });

//     res.status(200).json({
//       data: indicators,
//     });
//   } catch (error) {
//     console.error("Error fetching indicators:", error);
//     res.status(500).json({ error: "Failed to fetch indicators" });
//   }
// });

// app.get("/indicator/:indicatorId", async (req, res) => {
//   const { indicatorId } = req.params;
//   const id = parseInt(indicatorId, 10);
//   if (isNaN(id)) {
//     res.status(400).json({ error: "Invalid indicator ID" });
//     return;
//   }

//   try {
//     const indicator = await prisma.indicator.findUnique({
//       where: { id },
//     });

//     if (!indicator) {
//       res.status(404).json({ error: "Indicator not found" });
//       return;
//     }

//     res.status(200).json({
//       data: indicator,
//     });
//   } catch (error) {
//     console.error("Error fetching indicator:", error);
//     res.status(500).json({ error: "Failed to fetch indicator" });
//   }
// });

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
