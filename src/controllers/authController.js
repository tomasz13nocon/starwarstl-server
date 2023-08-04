import { LuciaError } from "lucia";
import { auth } from "../lucia.js";

export const signup = async (req, res) => {
  const { username, password } = req.body;

  if (
    typeof username !== "string" ||
    username.length < 4 ||
    username.length > 63
  ) {
    return res.status(400).send("Invalid username");
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).send("Invalid password");
  }
  try {
    const user = await auth.createUser({
      key: {
        providerId: "username", // auth method
        providerUserId: username.toLowerCase(), // unique id when using "username" auth method
        password, // hashed by Lucia
      },
      attributes: {
        username,
        createdAt: new Date(),
      },
    });
    const session = await auth.createSession({
      userId: user.userId,
      attributes: {},
    });
    const authRequest = auth.handleRequest(req, res);
    authRequest.setSession(session);
    console.log(session);
    // return res.status(302).setHeader("Location", "/").end();
    return res.sendStatus(200);
  } catch (e) {
    if (e instanceof Error && e.message.includes("E11000")) {
      return res.status(400).send("Username already taken");
    }

    return res.status(500).send("An unknown error occurred");
  }
};

export const login = async (req, res) => {
  const { username, password } = req.body;

  if (
    typeof username !== "string" ||
    username.length < 1 ||
    username.length > 63
  ) {
    return res.status(400).send("Invalid username");
  }
  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 255
  ) {
    return res.status(400).send("Invalid password");
  }
  try {
    // find user by key
    // and validate password
    const user = await auth.useKey(
      "username",
      username.toLowerCase(),
      password
    );
    const session = await auth.createSession({
      userId: user.userId,
      attributes: {},
    });
    const authRequest = auth.handleRequest(req, res);
    authRequest.setSession(session);
    return res.sendStatus(200);
  } catch (e) {
    // check for unique constraint error in user table
    if (
      e instanceof LuciaError &&
      (e.message === "AUTH_INVALID_KEY_ID" ||
        e.message === "AUTH_INVALID_PASSWORD")
    ) {
      // user does not exist
      // or invalid password
      return res.status(400).send("Incorrect username or password");
    }

    return res.status(500).send("An unknown error occurred");
  }
};

export const logout = async (req, res) => {
  const authRequest = auth.handleRequest(req, res);
  const session = await authRequest.validate(); // or `authRequest.validateBearerToken()`
  if (!session) {
    return res.sendStatus(401);
  }
  await auth.invalidateSession(session.sessionId);

  authRequest.setSession(null); // for session cookie

  return res.status(302).setHeader("Location", "/").end();
};

export const getUser = async (req, res) => {
  const authRequest = auth.handleRequest(req, res);
  const session = await authRequest.validate(); // or `authRequest.validateBearerToken()`
  if (session) {
    const user = session.user;
    const username = user.username;
    return res.json({ user, username });
  }
  return res.sendStatus(401);
};
