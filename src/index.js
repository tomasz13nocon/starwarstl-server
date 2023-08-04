import express from "express";
import cors from "cors";
import compression from "compression";

import { auth } from "./lucia.js";

import {
  getMedia,
  getMediaField,
  getMediaRandom,
  getAllSeries,
  getAllMedia,
} from "./controllers/mediaController.js";
import {
  getUser,
  login,
  logout,
  signup,
} from "./controllers/authController.js";
import {
  getAppearance,
  getAppearances,
} from "./controllers/appearancesController.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
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

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/user", getUser);

appearancesRouter.get("/:type", getAppearances);
appearancesRouter.get("/:type/:name", getAppearance);

app.use("/api", router);
app.use("/api/auth", authRouter);
app.use("/api/appearances", appearancesRouter);

app.listen(5000, () => {
  console.log("Server started on port 5000");
});
