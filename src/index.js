import express from "express";
import cors from "cors";
import compression from "compression";
import "dotenv/config";
import { auth } from "./auth.js";
import {
  getMedia,
  getMediaField,
  getMediaRandom,
  getAllSeries,
  getAllMedia,
  getWatched,
  addToWatched,
  getUserLists,
  addToWatchlist,
  removeFromWatched,
  removeFromWatchlist,
} from "./controllers/mediaController.js";
import {
  getUser,
  login,
  logout,
  sendEmailVerification,
  signup,
  verifyEmail,
} from "./controllers/authController.js";
import {
  getAppearance,
  getAppearances,
} from "./controllers/appearancesController.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(compression());
app.use((req, res, next) => {
  res.locals.auth = auth.handleRequest(req, res);
  next();
});

const router = express.Router();
const authRouter = express.Router();
const appearancesRouter = express.Router();

router.get("/media", getAllMedia);
router.get("/media/:id", getMedia);
router.get("/media/:id/:field", getMediaField);
router.get("/media-random", getMediaRandom);
router.get("/series", getAllSeries);
router.get("/me/lists", getUserLists);
router.post("/watched", addToWatched);
router.delete("/watched/:id", removeFromWatched);
router.post("/watchlist", addToWatchlist);
router.delete("/watchlist/:id", removeFromWatchlist);

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/user", getUser);
authRouter.post("/email-verification", sendEmailVerification);
authRouter.get("/email-verification/:token", verifyEmail);

appearancesRouter.get("/:type", getAppearances);
appearancesRouter.get("/:type/:name", getAppearance);

app.use("/api", router);
app.use("/api/auth", authRouter);
app.use("/api/appearances", appearancesRouter);

// app.get("/api/test/", (req, res) => {
// });

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? "An unknown error occurred" });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
