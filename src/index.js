import express from "express";
import cors from "cors";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import "dotenv/config";
import { prod } from "./global.js";
import {
  getMedia,
  getMediaField,
  getMediaRandom,
  getAllSeries,
  getAllMedia,
} from "./controllers/mediaController.js";
import {
  updateList,
  addToList,
  deleteList,
  createList,
  getUserList,
} from "./controllers/listController.js";
import {
  getUser,
  login,
  logout,
  resetPassword,
  resendEmailVerification,
  signup,
  verifyEmail,
} from "./controllers/authController.js";
import {
  getAppearance,
  getAppearances,
} from "./controllers/appearancesController.js";
import {
  authSetup,
  authenticate,
  csrf,
  errorHandler,
  jsonOnly,
} from "./middlewares.js";

const limiter = prod
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 30,
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      message: { error: "Too many requests, try again later." },
    })
  : (req, res, next) => next();
const strictLimiter = // prod ?
  rateLimit({
    windowMs: 10 * 60 * 1000, // 15 minutes
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again later." },
  });
//: (req, res, next) => next();

const app = express();

// Show user IPs, required for rate limiter
app.set("trust proxy", 1 /* number of proxies between user and server */);

app.use(cors());
app.use(express.json());
app.use(compression());

app.use(csrf);
app.use(jsonOnly);
app.use(authSetup);

const router = express.Router();
const routerProtected = express.Router();
const authRouter = express.Router();
const authRouterProtected = express.Router();
const appearancesRouter = express.Router();

routerProtected.use(authenticate);
authRouterProtected.use(authenticate);

router.get("/media", getAllMedia);
router.get("/media/:id", getMedia);
router.get("/media/:id/:field", getMediaField);
router.get("/media-random", getMediaRandom);
router.get("/series", getAllSeries);

// router.get("/lists", getUserLists); // unused - we get this from /auth/user
routerProtected.post("/lists", createList);
routerProtected.delete("/lists/:listName", deleteList);
routerProtected.post("/lists/:listName", addToList);
routerProtected.get("/lists/:listName", getUserList);
routerProtected.patch("/lists/:listName", updateList);

authRouter.post("/signup", strictLimiter, signup);
authRouter.post("/login", limiter, login);
authRouter.post("/reset-password", strictLimiter, resetPassword);
authRouter.get("/email-verification/:token", limiter, verifyEmail);

authRouterProtected.get("/user", getUser);
authRouterProtected.post("/logout", logout);
authRouterProtected.post(
  "/email-verification",
  strictLimiter,
  resendEmailVerification,
);

appearancesRouter.get("/:type", getAppearances);
appearancesRouter.get("/:type/:name", getAppearance);

app.use("/api", router);
app.use("/api/auth", authRouter);
app.use("/api/appearances", appearancesRouter);

app.use("/api", routerProtected);
app.use("/api/auth", authRouterProtected);

// app.get("/api/test/", (req, res) => {
//   console.log(req.body.foo);
//   res.sendStatus(200);
// });

// Must be last
app.use(errorHandler);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
