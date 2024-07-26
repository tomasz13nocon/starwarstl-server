import { Argon2id } from "oslo/password";
import {
  auth,
  generateEmailVerificationToken,
  sendEmailVerificationLink,
  validateEmailVerificationToken,
} from "../auth.js";
import { TokenError } from "../auth.js";
import { getDatabase } from "../db.js";
import { validateEmail, validatePassword } from "./validators.js";
import { projectList } from "../global.js";

let db = await getDatabase();

const getUserFrontendValues = async (sessionUser) => {
  let lists = await db
    .collection("lists")
    // This might be a lucia user obj or mongodb user obj, so try both ID names
    .find({ userId: sessionUser._id ?? sessionUser.id })
    .sort({ createdAt: 1 })
    .toArray();
  let rv = {
    email: sessionUser.email,
    lists: lists.map(projectList),
  };
  if (!sessionUser.emailVerified) rv.emailUnverified = true;
  return rv;
};

const createSession = async (res, userId) => {
  const session = await auth.createSession(userId, {});
  res.appendHeader(
    "Set-Cookie",
    auth.createSessionCookie(session.id).serialize(),
  );
  return session;
};

export const signup = async (req, res, next) => {
  const { email: emailRaw, password } = req.body;

  const email = emailRaw.toLowerCase();
  validateEmail(email);
  validatePassword(password);

  const passwordHash = await new Argon2id().hash(password);

  try {
    const user = {
      email,
      emailVerified: false,
      createdAt: new Date(),
      passwordHash,
    };
    const { insertedId: userId } = await db.collection("users").insertOne(user);
    user.id = userId;

    await db.collection("lists").insertMany([
      {
        userId,
        name: "Watched",
        items: [],
        createdAt: new Date(),
      },
      {
        userId,
        name: "Watchlist",
        items: [],
        createdAt: new Date(Date.now() + 1),
      },
    ]);

    const token = await generateEmailVerificationToken(userId);

    // TODO no need to await
    await sendEmailVerificationLink(email, token);

    await createSession(res, userId);

    return res.json(await getUserFrontendValues(user));
  } catch (e) {
    if (e.code === 11000) return res.json({ error: "Email already taken" });
    else return next(e);
  }
};

export const login = async (req, res, next) => {
  const { email, password } = req.body;

  validateEmail(email);
  validatePassword(password);

  const user = await db.collection("users").findOne({ email });
  if (user === null) {
    return res.json({ error: "Account does not exist" });
  }

  const isPasswordCorrect = await new Argon2id().verify(
    user.passwordHash,
    password,
  );
  if (!isPasswordCorrect) {
    return res.json({ error: "Incorrect password" });
  }

  await createSession(res, user._id);
  return res.json(await getUserFrontendValues(user));
};

export const logout = async (req, res) => {
  await auth.invalidateSession(res.locals.session.id);
  return res.json({});
};

export const getUser = async (req, res) => {
  return res.json(await getUserFrontendValues(res.locals.user));
};

export const resendEmailVerification = async (req, res) => {
  if (res.locals.user.emailVerified) {
    // TODO: proper status, so we can set client state to remove resend button
    return res.status(410).json({ info: "Email already verified" });
  }

  const token = await generateEmailVerificationToken(res.locals.user.id);
  await sendEmailVerificationLink(res.locals.user.email, token);
  return res.json({});
};

export const verifyEmail = async (req, res, next) => {
  const token = req.params.token;

  if (res.locals.user?.emailVerified)
    return res.json({ info: "Email already verified" });

  try {
    const userId = await validateEmailVerificationToken(token);

    const usersColl = db.collection("users");

    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) {
      throw new Error("Trying to verify email for user who doesn't exist!");
    }

    await usersColl.updateOne(
      { _id: userId },
      { $set: { emailVerified: true } },
    );
    user.emailVerified = true;

    await auth.invalidateUserSessions(userId);
    await createSession(res, userId);

    return res.json(await getUserFrontendValues(user));
  } catch (e) {
    if (e instanceof TokenError) return res.json({ error: e.message });
    else next(e);
  }
};

export const resetPassword = async (req, res) => {
  // TODO
  return res.json({});
};
