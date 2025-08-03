import { PrismaClient } from "@prisma/client";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { DateTime } from "luxon";

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

interface LogData {
  sample: number;
  I: number;
  timestamp: Date | string;
  identifier: string;
}

const logModels = {
  log1: prisma.logs1,
  log2: prisma.logs2,
  log3: prisma.logs3,
  log4: prisma.logs4,
  log5: prisma.logs5,
  log6: prisma.logs6,
} as const;

type LogRouteKey = keyof typeof logModels;

// Dynamic POST endpoint
app.post("/:logTable", async (req, res) => {
  const logTable = req.params.logTable as LogRouteKey;
  const model = logModels[logTable] as any;

  if (!model) {
    return res.status(400).json({ error: "Invalid log table name" });
  }

  const data: Omit<LogData, "timestamp">[] = req.body;

  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "Expected array of data" });
  }

  console.log(`Received data for ${logTable}:`, data);

  if (!data.find((entry) => entry.I >= 400)) {
    return res.status(200).json({ message: "No data with I > 400 found." });
  }

  const uniqueHash = uuidv4();
  const nowJakarta = DateTime.now().setZone("Asia/Jakarta");

  const preparedData = data.map((entry, index, arr) => ({
    sample: entry.sample,
    i: entry.I,
    timestamp: nowJakarta
      .minus({ seconds: arr.length - index - 1 })
      .toJSDate(),
    identifier: uniqueHash,
  }));

  await model.createMany({ data: preparedData });

  res.status(201).json({ message: `Data saved to ${logTable}` });
});

// Dynamic GET endpoint
app.get("/:logTable", async (req, res) => {
  const logTable = req.params.logTable as LogRouteKey;
  const model = logModels[logTable] as any;

  if (!model) {
    return res.status(400).json({ error: "Invalid log table name" });
  }

  const rawLogs = await model.findMany({
    where: {
      i: {
        gte: 400,
      },
    },
    orderBy: {
      timestamp: "asc",
    },
  });

  const grouped = _(rawLogs)
    .groupBy("identifier")
    .map((logs) => ({
      id: logs[0].identifier,
      timestamp: DateTime.fromJSDate(logs[0].timestamp)
        .setZone("Asia/Jakarta")
        .toISO(),
    }))
    .value();

  const indicators = await prisma.indicator.findFirst({
    orderBy: {
      id: "asc",
    },
  });

  const formattedIndicators = {
    id: indicators?.id || 0,
    i: indicators?.i || 0,
    updatedAt: indicators?.updatedAt
      ? DateTime.fromJSDate(indicators.updatedAt)
          .setZone("Asia/Jakarta")
          .toISO()
      : null,
  };

  res.status(200).json({
    status: formattedIndicators,
    arus: grouped,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
