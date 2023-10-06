import { lucia } from "lucia";
import { express } from "lucia/middleware";
import { generateRandomString, isWithinExpiration } from "lucia/utils";
import { mongodb } from "./adapter-mongodb.js";
import { getDatabase, startSession } from "./db.js";
import { env } from "./global.js";
import nodemailer from "nodemailer";

let db = await getDatabase();

export class TokenError extends Error {
  constructor(message, ...args) {
    super(message, ...args);
    this.name = "TokenError";
  }
}

export const auth = lucia({
  env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
  middleware: express(),
  adapter: mongodb(db),
  csrfProtection: env !== "dev",

  getUserAttributes: ({ email, emailVerified, createdAt }) => {
    return {
      email,
      emailVerified,
      createdAt,
    };
  },
});

const EXPIRES_IN = 1000 * 60 * 60 * 24; // 24 hours

export const generateEmailVerificationToken = async (userId) => {
  const tokensColl = db.collection("emailVerificationTokens");
  const storedUserTokens = tokensColl.find({ userId }).toArray();
  if (storedUserTokens.length > 0) {
    const reusableStoredToken = storedUserTokens.find((token) => {
      return isWithinExpiration(Number(token.expires) - EXPIRES_IN / 2);
    });
    if (reusableStoredToken) return reusableStoredToken.id;
  }
  const token = generateRandomString(63);
  await tokensColl.insertOne({
    token,
    expires: new Date().getTime() + EXPIRES_IN,
    userId,
  });

  return token;
};

export const validateEmailVerificationToken = async (token) => {
  const tokensColl = db.collection("emailVerificationTokens");
  const session = await startSession();
  let storedToken;
  try {
    await session.withTransaction(async () => {
      storedToken = await tokensColl.findOne({ token }, { session });
      if (!storedToken) throw new TokenError("Invalid verification token");
      await tokensColl.deleteMany({ userId: storedToken.userId }, { session });
    });
  } finally {
    await session.endSession();
  }

  const tokenExpires = Number(storedToken.expires); // TODO types
  if (!isWithinExpiration(tokenExpires)) {
    throw new TokenError(
      "Expired verification token. Please log in and request a new one.",
    );
  }
  return storedToken.userId;
};

export const sendEmailVerificationLink = async (email, token) => {
  const url = `${
    env === "prod" ? "https://starwarstl.com/" : "http://localhost:8080/"
  }email-verification/${token}`;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAILBOT_USER,
      pass: process.env.MAILBOT_PASS,
    },
  });
  const info = await transporter.sendMail({
    from: process.env.MAILBOT_FROM,
    to: email,
    subject: "Verify your email",
    text: `You have created an account on https://starwarstl.com.

Click this link to verify your email: ${url}`,
  });
  if (info.rejected.length > 0) {
    throw new Error("Failed to send email, response: " + info.response);
  }
};
