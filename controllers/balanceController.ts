import { Request, Response } from "express";
import mongoose from "mongoose";
import { Expense } from "../models/Expense";
import { Credit } from "../models/Credit";

const periodBounds = () => {
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return { now, startOfToday, startOfWeek, startOfMonth };
};

const sumSince = async (
  model: typeof Expense | typeof Credit,
  userId: mongoose.Types.ObjectId,
  start?: Date,
) => {
  const match: any = { userId };
  if (start) match.date = { $gte: start };

  const rows = await (model as any).aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  return { total: rows[0]?.total || 0, count: rows[0]?.count || 0 };
};

export const getBalanceSummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const { startOfToday, startOfWeek, startOfMonth } = periodBounds();

    const periods: Array<[string, Date | undefined]> = [
      ["today", startOfToday],
      ["thisWeek", startOfWeek],
      ["thisMonth", startOfMonth],
      ["allTime", undefined],
    ];

    const results = await Promise.all(
      periods.map(async ([key, start]) => {
        const [spent, received] = await Promise.all([
          sumSince(Expense, userId, start),
          sumSince(Credit, userId, start),
        ]);
        return [
          key,
          {
            spent: spent.total,
            received: received.total,
            net: spent.total - received.total,
            expenseCount: spent.count,
            creditCount: received.count,
          },
        ] as const;
      }),
    );

    res.json({ success: true, data: Object.fromEntries(results) });
  } catch (error) {
    console.error("Balance summary error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch balance summary" });
  }
};

const dateRangeMatch = (userId: mongoose.Types.ObjectId, query: any) => {
  const match: any = { userId };

  if (query.startDate || query.endDate) {
    match.date = {};
    if (query.startDate) match.date.$gte = new Date(query.startDate as string);
    if (query.endDate) {
      const end = new Date(query.endDate as string);
      end.setHours(23, 59, 59, 999);
      match.date.$lte = end;
    }
  }

  return match;
};

const dayGroupStage = [
  {
    $group: {
      _id: {
        $dateToString: { format: "%Y-%m-%d", date: "$date" },
      },
      total: { $sum: "$amount" },
      count: { $sum: 1 },
    },
  },
];

export const getDailyBalance = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const match = dateRangeMatch(userId, req.query);

    if (!match.date) {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      match.date = { $gte: start };
    }

    const [spentRows, receivedRows] = await Promise.all([
      Expense.aggregate([{ $match: match }, ...dayGroupStage]),
      Credit.aggregate([{ $match: match }, ...dayGroupStage]),
    ]);

    const byDate = new Map<string, { spent: number; received: number }>();
    for (const row of spentRows) {
      byDate.set(row._id, { spent: row.total, received: 0 });
    }
    for (const row of receivedRows) {
      const existing = byDate.get(row._id) || { spent: 0, received: 0 };
      existing.received = row.total;
      byDate.set(row._id, existing);
    }

    const data = [...byDate.entries()]
      .map(([date, v]) => ({
        date,
        spent: v.spent,
        received: v.received,
        net: v.spent - v.received,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Daily balance error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch daily balance" });
  }
};

const monthGroupStage = [
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
      total: { $sum: "$amount" },
    },
  },
];

export const getMonthlyBalance = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const months = Math.min(
      Math.max(parseInt((req.query.months as string) || "6", 10) || 6, 1),
      24,
    );

    const start = new Date();
    start.setMonth(start.getMonth() - (months - 1));
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const match = { userId, date: { $gte: start } };

    const [spentRows, receivedRows] = await Promise.all([
      Expense.aggregate([{ $match: match }, ...monthGroupStage]),
      Credit.aggregate([{ $match: match }, ...monthGroupStage]),
    ]);

    const spentByMonth = new Map(spentRows.map((r) => [r._id, r.total]));
    const receivedByMonth = new Map(receivedRows.map((r) => [r._id, r.total]));

    const data = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const spent = spentByMonth.get(label) || 0;
      const received = receivedByMonth.get(label) || 0;
      data.push({
        label,
        month: d.toLocaleDateString("en-IN", { month: "short" }),
        spent,
        received,
        net: spent - received,
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Monthly balance error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch monthly balance" });
  }
};
