import { Request, Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Credit } from "../models/Credit";

const creditSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  source: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  date: z.string().min(1, "Date is required"),
  method: z
    .enum(["cash", "upi", "bank_transfer", "other"])
    .optional()
    .default("upi"),
});

const buildQuery = (userId: string, query: any) => {
  const match: any = { userId: new mongoose.Types.ObjectId(userId) };

  if (query.startDate || query.endDate) {
    match.date = {};
    if (query.startDate) match.date.$gte = new Date(query.startDate as string);
    if (query.endDate) {
      const end = new Date(query.endDate as string);
      end.setHours(23, 59, 59, 999);
      match.date.$lte = end;
    }
  }

  if (query.source) {
    match.source = new RegExp(`^${String(query.source).trim()}$`, "i");
  }

  return match;
};

export const getCredits = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "20",
      sortBy = "date",
      order = "desc",
    } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sortOrder = order === "asc" ? 1 : -1;

    const query = buildQuery(req.userId!, req.query);

    const [credits, total, totalsAgg] = await Promise.all([
      Credit.find(query)
        .sort({ [sortBy as string]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Credit.countDocuments(query),
      Credit.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    res.json({
      success: true,
      data: credits,
      meta: { filteredTotal: totalsAgg[0]?.total || 0 },
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error("Get credits error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch credits" });
  }
};

export const createCredit = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { amount, source, description, date, method } = creditSchema.parse(
      req.body,
    );

    const credit = new Credit({
      userId: req.userId,
      amount,
      source,
      description,
      date: new Date(date),
      method,
    });

    await credit.save();

    res.status(201).json({ success: true, data: credit });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    console.error("Create credit error:", error);
    res.status(500).json({ success: false, error: "Failed to create credit" });
  }
};

export const updateCredit = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { amount, source, description, date, method } = creditSchema.parse(
      req.body,
    );

    const credit = await Credit.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { amount, source, description, date: new Date(date), method },
      { new: true, runValidators: true },
    );

    if (!credit) {
      res.status(404).json({ success: false, error: "Credit not found" });
      return;
    }

    res.json({ success: true, data: credit });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    console.error("Update credit error:", error);
    res.status(500).json({ success: false, error: "Failed to update credit" });
  }
};

export const deleteCredit = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const credit = await Credit.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!credit) {
      res.status(404).json({ success: false, error: "Credit not found" });
      return;
    }

    res.json({ success: true, message: "Credit deleted successfully" });
  } catch (error) {
    console.error("Delete credit error:", error);
    res.status(500).json({ success: false, error: "Failed to delete credit" });
  }
};

export const getCreditsBySource = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const match = buildQuery(req.userId!, req.query);

    const data = await Credit.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $trim: {
              input: { $ifNull: ["$source", "Unlabelled"] },
            },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          lastDate: { $max: "$date" },
        },
      },
      {
        $project: {
          _id: 0,
          source: {
            $cond: [{ $eq: ["$_id", ""] }, "Unlabelled", "$_id"],
          },
          total: 1,
          count: 1,
          lastDate: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Credits by source error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch credits by source" });
  }
};
