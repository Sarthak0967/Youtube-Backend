import { Router } from "express";
import { getVideoComments, addComment, deleteComment, updateComment } from "../controllers/comment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/:videoId", verifyJWT, getVideoComments);
router.post("/:videoId", verifyJWT, addComment);
router.put("/:videoId/:commentId", verifyJWT, updateComment);
router.delete("/:videoId/:commentId", verifyJWT, deleteComment);

export default router;