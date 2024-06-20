import { generateIdFromEntropySize } from "lucia";
import { Argon2id } from "oslo/password";
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
  let lists = await db
    .collection("lists")
    // This might be a lucia user obj or mongodb user obj, so try both ID names
    .find({ userId: sessionUser.id ?? sessionUser._id })
    .toArray();
  let rv = {
    email: sessionUser.email,
    lists: {
      watched: lists.find((list) => list.name === watchedName)?.items ?? [],
      watchlist: lists.find((list) => list.name === watchlistName)?.items ?? [],
      custom: lists
        .filter((list) => !list.name.startsWith("__"))
        .map((list) => list.items),
    },
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
  const { email, password } = req.body;

  if (typeof email !== "string" || !/.+@.+\..+/.test(email)) {
    return res.json({ error: "Invalid email" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.json({ error: "Invalid password" });
  }

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

    // const token = await generateEmailVerificationToken(id);
    // TODO no need to await
    // await sendEmailVerificationLink(email, token);

    await createSession(res, userId);

    return res.json(await getUserFrontendValues(user));
  } catch (e) {
    if (e.code === 11000) return res.json({ error: "Email already taken" });
    else return next(e);
  }
};

export const login = async (req, res, next) => {
  const { email, password } = req.body;

  // TODO create verifyEmail and pw functions, code above
  if (typeof email !== "string") {
    return res.json({ error: "Invalid email" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.json({ error: "Invalid password" });
  }

  const user = await db.collection("users").findOne({ email });
  if (user === null) {
    return res.json({ error: "Incorrect email or password" });
  }

  const validPassword = await new Argon2id().verify(
    user.passwordHash,
    password,
  );
  if (!validPassword) {
    return res.json({ error: "Incorrect email or password" });
  }

  await createSession(res, user._id);
  return res.json(await getUserFrontendValues(user));
};

export const logout = async (req, res) => {
  if (!res.locals.session) {
    return res.json(null);
  }
  await auth.invalidateSession(res.locals.session.id);
  return res.json(null);
};

export const getUser = async (req, res) => {
  if (res.locals.session) {
    return res.json(await getUserFrontendValues(res.locals.user));
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

export const resetPassword = async (req, res) => {
  return res.json({});
};
