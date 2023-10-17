import { LuciaError } from "lucia";
import {
  auth,
  generateEmailVerificationToken,
  sendEmailVerificationLink,
  validateEmailVerificationToken,
} from "../auth.js";
import { TokenError } from "../auth.js";
import { getDatabase, watchedName, watchlistName } from "../db.js";

let db = await getDatabase();

const getUserFrontendValues = async (sessionUser) => {
  const { email, emailVerified } = sessionUser;
  let lists = await db
    .collection("lists")
    .find({ userId: sessionUser.userId })
    .toArray();
  let rv = {
    email,
    lists: {
      watched: lists.find((list) => list.name === watchedName)?.items ?? [],
      watchlist: lists.find((list) => list.name === watchlistName)?.items ?? [],
      custom: lists
        .filter((list) => !list.name.startsWith("__"))
        .map((list) => list.items),
    },
  };
  if (!emailVerified) rv.emailUnverified = true;
  return rv;
};

const createSession = async (req, res, userId) => {
  const session = await auth.createSession({
    userId,
    attributes: {},
  });
  const authRequest = auth.handleRequest(req, res);
  authRequest.setSession(session);
};

export const signup = async (req, res, next) => {
  const { email, password } = req.body;

  if (typeof email !== "string") {
    return res.json({ error: "Invalid email" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.json({ error: "Invalid password" });
  }
  // TODO check if email valid
  try {
    const user = await auth.createUser({
      key: {
        providerId: "email",
        providerUserId: email.toLowerCase(), // TODO does this have unique constraint?
        password, // hashed by Lucia
      },
      attributes: {
        email,
        emailVerified: false,
        createdAt: new Date(),
      },
    });

    const token = await generateEmailVerificationToken(user.userId);
    await sendEmailVerificationLink(email, token);

    await createSession(req, res, user.userId);
    return res.json(
      await getUserFrontendValues(await auth.getUser(user.userId)),
    );
  } catch (e) {
    if (
      e instanceof LuciaError &&
      e.message.includes("AUTH_DUPLICATE_KEY_ID")
    ) {
      return res.json({ error: "Email already taken" });
    }
    next(e);
  }
};

export const login = async (req, res, next) => {
  const { email, password } = req.body;

  if (typeof email !== "string") {
    return res.json({ error: "Invalid email" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.json({ error: "Invalid password" });
  }
  try {
    const user = await auth.useKey("email", email.toLowerCase(), password);
    await createSession(req, res, user.userId);
    return res.json(
      await getUserFrontendValues(await auth.getUser(user.userId)),
    );
  } catch (e) {
    if (
      e instanceof LuciaError &&
      (e.message === "AUTH_INVALID_KEY_ID" ||
        e.message === "AUTH_INVALID_PASSWORD")
    ) {
      return res.json({ error: "Incorrect email or password" });
    }
    next(e);
  }
};

export const logout = async (req, res) => {
  const authRequest = auth.handleRequest(req, res);
  const session = await authRequest.validate();
  if (!session) {
    return res.json(null);
  }
  await auth.invalidateSession(session.sessionId);
  authRequest.setSession(null);
  return res.json(null);
};

export const getUser = async (req, res) => {
  const authRequest = auth.handleRequest(req, res);
  const session = await authRequest.validate();
  if (session) {
    return res.json(await getUserFrontendValues(session.user));
  }
  return res.json(null);
};

export const sendEmailVerification = async (req, res) => {
  const authRequest = auth.handleRequest(req, res);
  const session = await authRequest.validate();
  if (!session) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (session.user.emailVerified) {
    return res.json({ error: "Email already verified" }); // TODO error?
  }

  const token = await generateEmailVerificationToken(session.user.userId);
  await sendEmailVerificationLink(session.user.email, token);
  return res.json(null);
};

export const verifyEmail = async (req, res, next) => {
  const token = req.params.token;
  try {
    const userId = await validateEmailVerificationToken(token);
    const user = await auth.getUser(userId);
    await auth.invalidateAllUserSessions(user.userId);
    await auth.updateUserAttributes(user.userId, {
      emailVerified: true,
    });
    await createSession(req, res, user.userId);
    return res.json(
      await getUserFrontendValues(await auth.getUser(user.userId)),
    );
  } catch (e) {
    if (e instanceof TokenError) {
      return res.json({ error: e.message });
    }
    next(e);
  }
};
