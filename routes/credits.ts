import { Router } from "express";
import {
  getCredits,
  createCredit,
  updateCredit,
  deleteCredit,
  getCreditsBySource,
} from "../controllers/creditController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/analytics/by-source", getCreditsBySource);

router.get("/", getCredits);
router.post("/", createCredit);
router.put("/:id", updateCredit);
router.delete("/:id", deleteCredit);

export default router;
