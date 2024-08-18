import { Argon2id } from "oslo/password";
import {
  auth,
  generateEmailVerificationToken,
  google,
  sendEmailVerificationLink,
  validateEmailVerificationToken,
} from "../auth.js";
import { TokenError } from "../auth.js";
import { getDatabase } from "../db.js";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "./validators.js";
import { baseUrl, prod, projectList } from "../global.js";
import {
  OAuth2RequestError,
  decodeIdToken,
  generateCodeVerifier,
  generateState,
} from "arctic";
import { getRandomName } from "../names.js";

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
    name: sessionUser.name,
    lists: lists.map(projectList),
    authType: sessionUser.authType,
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

const newSession = async (res, user) => {
  await createSession(res, user.id ?? user._id);
  return res.json(await getUserFrontendValues(user));
};

const createUser = async (user) => {
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

  return user;
};

export const signup = async (req, res, next) => {
  const { email: emailRaw, password, name } = req.body;

  const email = emailRaw.toLowerCase();
  validateEmail(email);
  validateUsername(name);
  validatePassword(password);

  const passwordHash = await new Argon2id().hash(password);

  try {
    const user = await createUser({
      authType: "email",
      name,
      email,
      emailVerified: false,
      passwordHash,
      createdAt: new Date(),
    });

    const token = await generateEmailVerificationToken(user.id);
    // TODO no need to await
    await sendEmailVerificationLink(email, token);

    return await newSession(res, user);
  } catch (e) {
    if (e.code === 11000) {
      if ("email" in e.keyValue) {
        return res.json({ error: "Email already taken" });
      } else {
        return res.json({ error: "Username already taken" });
      }
    }
    return next(e);
  }
};

export const login = async (req, res) => {
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

  return await newSession(res, user);
};

export const loginWithGoogle = async (req, res) => {
  const state = generateState();
  const code = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, code, ["profile", "email"]);
  url.searchParams.set("access_type", "offline");

  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: prod, // set `Secure` flag in HTTPS
    maxAge: 1000 * 60 * 10, // 10 minutes
    path: "/",
  });
  res.cookie("google_oauth_code_verifier", code, {
    secure: true, // set to false in localhost
    path: "/",
    httpOnly: true,
    maxAge: 1000 * 60 * 10, // 10 min
  });

  res.json({ authorizationUrl: url.toString() });
};

export const googleCallback = async (req, res) => {
  res.status(302).set("Location", baseUrl + "login/google/callback");

  const stateCookie = req.cookies.google_oauth_state;
  const codeCookie = req.cookies.google_oauth_code_verifier;
  const state = req.query.state;
  const code = req.query.code;

  // verify state
  if (!codeCookie || !stateCookie || !code || stateCookie !== state) {
    return res
      .status(400)
      .json({ error: "code or state missing or incorrect" });
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, codeCookie);
    const idToken = tokens.idToken();
    const claims = decodeIdToken(idToken);

    const existingUser = await db
      .collection("users")
      .findOne({ authType: "google", oauthId: claims.sub });

    if (existingUser) {
      return await newSession(res, existingUser);
    }

    res.append("Location", "?newaccount=true");

    let name, nameTaken;
    do {
      // Collision won't be an issue up to 1+ million google users. This will be a great problem to have.
      name = getRandomName();
      nameTaken = (await db.collection("users").findOne({ name })) !== null;
    } while (nameTaken);

    const user = await createUser({
      authType: "google",
      name,
      email: claims.email,
      emailVerified: claims.email_verified,
      createdAt: new Date(),
      oauthId: claims.sub,
      pictureUrl: claims.picture,
    });

    return await newSession(res, user);
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      const { request, message, description } = e;
      // console.error(request, message, description);
      return res.status(400).json({ error: description });
    }
    if (e.code === 11000) {
      // if ("name" in e.keyValue) {
      //   return res.json({ error: "Username already taken" });
      // }
      console.error("Unreachable");
    }
    throw e;
  }
};

export const logout = async (req, res) => {
  await auth.invalidateSession(res.locals.session.id);
  return res.json({});
};

export const getUser = async (req, res) => {
  if (!res.locals.session) return res.status(401).json({});
  return res.json(await getUserFrontendValues(res.locals.user));
};

export const getUserByName = async (req, res) => {
  const { name } = req.params;

  validateUsername(name, true);

  let user = await db.collection("users").findOne({ name });

  if (!user) return res.status(404).json({});

  return res.json({ name });
};

export const changeUser = async (req, res) => {
  const { name } = req.body;

  validateUsername(name);

  try {
    await db
      .collection("users")
      .updateOne({ _id: res.locals.user.id }, { $set: { name } });

    return res.json({});
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ error: "Username taken" });
    }
    throw e;
  }
};

export const resendEmailVerification = async (req, res) => {
  if (res.locals.user.emailVerified) {
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

    return await newSession(res, user);
  } catch (e) {
    if (e instanceof TokenError) return res.json({ error: e.message });
    else next(e);
  }
};

export const resetPassword = async (req, res) => {
  // TODO
  return res.json({});
};
