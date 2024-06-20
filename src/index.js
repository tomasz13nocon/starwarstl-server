import express from "express";
import cors from "cors";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import "dotenv/config";
import { auth } from "./auth.js";
import { verifyRequestOrigin } from "lucia";
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
  resetPassword,
  sendEmailVerification,
  signup,
  verifyEmail,
} from "./controllers/authController.js";
import {
  getAppearance,
  getAppearances,
} from "./controllers/appearancesController.js";
import { prod } from "./global.js";

const limiter = prod
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 50, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    })
  : (req, res, next) => next();

const app = express();

app.use(cors());
app.use(express.json());
app.use(compression());

// CSRF protection using Origin header, might not work in some pre 2020 browsers
app.use((req, res, next) => {
  if (req.method === "GET") {
    return next();
  }
  const originHeader = req.headers.origin ?? null;
  // NOTE: You may need to use `X-Forwarded-Host` instead
  const hostHeader = req.headers.host ?? null;
  if (
    !originHeader ||
    !hostHeader ||
    !verifyRequestOrigin(originHeader, [hostHeader])
  ) {
    // TODO log, analytics
    return res.status(403).end();
  }
  next();
});

// Auth middleware
app.use(async (req, res, next) => {
  const sessionId = auth.readSessionCookie(req.headers.cookie ?? "");
  if (!sessionId) {
    res.locals.user = null;
    res.locals.session = null;
    return next();
  }

  const { session, user } = await auth.validateSession(sessionId);
  if (session && session.fresh) {
    res.appendHeader(
      "Set-Cookie",
      auth.createSessionCookie(session.id).serialize(),
    );
  }
  if (!session) {
    res.appendHeader("Set-Cookie", auth.createBlankSessionCookie().serialize());
  }
  res.locals.user = user;
  res.locals.session = session;
  return next();
});

// Show user IPs, required for rate limiter
app.set("trust proxy", 1 /* number of proxies between user and server */);

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

authRouter.get("/user", getUser);
authRouter.post("/signup", limiter, signup);
authRouter.post("/login", limiter, login);
authRouter.post("/logout", logout);
authRouter.post("/reset-password", limiter, resetPassword);
authRouter.post("/email-verification", limiter, sendEmailVerification);
authRouter.get("/email-verification/:token", limiter, verifyEmail);

appearancesRouter.get("/:type", getAppearances);
appearancesRouter.get("/:type/:name", getAppearance);

app.use("/api", router);
app.use("/api/auth", authRouter);
app.use("/api/appearances", appearancesRouter);

// app.get("/api/test/", (req, res) => {
// });

app.use((err, req, res, next) => {
  console.error("ERROR caught by express:");
  console.error(err);
  // TODO wtf this shouldn't just send backend error msgs
  res
    .status(500)
    .json({ error: err.frontendMessage ?? "An unknown error occurred" });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
