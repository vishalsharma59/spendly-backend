import mongoose, { Document, Model } from "mongoose";

export type CreditMethod = "cash" | "upi" | "bank_transfer" | "other";

export interface ICredit extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  source?: string;
  description?: string;
  date: Date;
  method: CreditMethod;
  createdAt: Date;
  updatedAt: Date;
}

const creditSchema = new mongoose.Schema<ICredit>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    source: {
      type: String,
      required: false,
      trim: true,
      maxlength: [60, "Source cannot exceed 60 characters"],
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
    },
    method: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "other"],
      default: "upi",
    },
  },
  {
    timestamps: true,
  },
);

creditSchema.index({ userId: 1, date: -1 });
creditSchema.index({ userId: 1, source: 1 });

export const Credit: Model<ICredit> = mongoose.model<ICredit>(
  "Credit",
  creditSchema,
);
