import { Lucia, generateIdFromEntropySize } from "lucia";
import { MongodbAdapter } from "@lucia-auth/adapter-mongodb";
import { getDatabase, startSession } from "./db.js";
import { baseUrl, prod, sendEmail } from "./global.js";
import { Google } from "arctic";
import { TimeSpan, createDate, isWithinExpirationDate } from "oslo";

let db = await getDatabase();

export class TokenError extends Error {
  constructor(message, ...args) {
    super(message, ...args);
    this.name = "TokenError";
  }
}

const adapter = new MongodbAdapter(
  db.collection("sessions"),
  db.collection("users"),
);

export const auth = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: prod,
    },
  },
  getUserAttributes: ({
    name,
    authType,
    email,
    emailVerified,
    oauthId,
    createdAt,
  }) => {
    return {
      name,
      authType,
      email,
      emailVerified,
      oauthId,
      createdAt,
    };
  },
});

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  baseUrl + "api/auth/login/google/callback",
);

export const generateEmailVerificationToken = async (userId) => {
  const tokensColl = db.collection("emailVerificationTokens");

  tokensColl.deleteMany({ userId });

  const token = generateIdFromEntropySize(25); // 40 characters long

  await tokensColl.insertOne({
    token,
    expiresAt: createDate(new TimeSpan(24, "h")),
    userId,
  });

  return token;
};

// Throws TokenError if token doesn't exist or has expired
export const validateEmailVerificationToken = async (token) => {
  const tokensColl = db.collection("emailVerificationTokens");
  const session = await startSession();
  let storedToken;
  try {
    await session.withTransaction(async () => {
      storedToken = await tokensColl.findOne({ token }, { session });
      if (!storedToken) throw new TokenError("Invalid verification token");
      await tokensColl.deleteOne({ userId: storedToken.userId }, { session });
    });
  } finally {
    await session.endSession();
  }

  // console.log("type of expiresAt: ", typeof storedToken.expiresAt);
  // const expiresAt = Number(storedToken.expiresAt); // TODO types
  // console.log("expiresAt: ", storedToken.expiresAt);
  // console.log("Number(expiresAt): ", expiresAt);

  if (!isWithinExpirationDate(storedToken.expiresAt)) {
    throw new TokenError(
      "Expired verification token. Please log in and request a new one.",
    );
  }
  return storedToken.userId;
};

export const sendEmailVerificationLink = async (email, token) => {
  const url = `${baseUrl}email-verification/${token}`;
  const emailText = `You have created an account on https://starwarstl.com.

Click this link to verify your email: ${url}`;
  const emailHtml = `<div style="font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.3); text-align: center;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #3a8ee7;">StarWarsTL - Account created!</h1>
    </div>
    <div style="margin-bottom: 20px;">
        <p>Please verify your email address by clicking the button below:</p>
        <p>
          <a href="${url}" style="display: inline-block; background-color: #3a8ee7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px auto; font-size: 16px;">Verify Your Email</a>
        </p>
        <p>If the button doesn’t work, you can also verify your email at this address:</p>
        <p>${url}</p>
    </div>
    <div style="font-size: 12px; color: #777; text-align: center;">
        <p>If you have any questions, feel free to reply to this email.</p>
        <p>Best regards,<br>StarWarsTL</p>
    </div>
</div>`;

  sendEmail(email, "Verify your email", emailHtml, emailText);
};
