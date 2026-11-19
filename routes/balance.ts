import { Router } from "express";
import {
  getBalanceSummary,
  getDailyBalance,
  getMonthlyBalance,
} from "../controllers/balanceController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/summary", getBalanceSummary);
router.get("/daily", getDailyBalance);
router.get("/monthly", getMonthlyBalance);

export default router;
