import { Prisma, PrismaClient } from "@prisma/client";
import express from "express";

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

interface LogData {
  sample: number;
  I: number;
  timestamp: Date;
}

app.post("/log", async (req, res) => {
  const data: Omit<LogData, "timestamp">[] = req.body;

  if (!Array.isArray(data)) {
    res.status(400).json({ error: "Invalid format, expected an array." });
    return;
  }

  console.log("Received data:", data);

  const now = new Date(); // current timestamp
  const preparedData = data.map((entry, index, arr) => ({
    sample: entry.sample,
    i: entry.I,
    timestamp: new Date(now.getTime() - 1000 * (arr.length - index - 1)),
  }));

  await prisma.log.createMany({
    data: preparedData,
  });

  res.status(201).json({
    message: "Data received successfully",
  });
});

app.get("/log", async (req, res) => {
  const logs = await prisma.log.findMany({
    orderBy: {
      timestamp: "desc",
    },
    take: 100, // Limit to the last 100 entries
  });

  res.status(200).json({
    data: logs,
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
