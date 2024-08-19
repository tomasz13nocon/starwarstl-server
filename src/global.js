import nodemailer from "nodemailer";

export const env = process.env.NODE_ENV; // dev | prod
export const dev = env === "dev";
export const prod = env === "prod";

export const baseUrl = prod
  ? "https://starwarstl.com/"
  : "http://localhost:8080/";
export const dbName = "starwarstl";
export const port = +process.env.PORT;
export const redisURI = process.env.REDIS_URI;
export const mongoURI = process.env.MONGO_URI;

const requiredEnv = [
  "NODE_ENV",
  "PORT",
  "REDIS_URI",
  "MONGO_URI",
  "MAIL_FROM",
  "SES_USER",
  "SES_PASS",
  "SES_ENDPOINT",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];
if (requiredEnv.some((name) => !process.env[name])) {
  throw new Error("Required env vars not present!");
}

export const builtinLists = ["Watched", "Watchlist"];

// TODO proper logging, analytics
export function logError(err, req) {
  console.error(`ERROR caught by express at url ${req.originalUrl}:`);
  console.error(err);
}

// Standard 4xx client error, does not get logged
// When thrown, message gets sent to client
export class ClientError extends Error {
  constructor(statusCode = 400, message, shouldLog = true, ...args) {
    super(message, ...args);
    this.name = "ClientError";
    this.statusCode = statusCode;
    this.shouldLog = shouldLog;
  }
}

// Some callers may also do a db projection before this, which would need to be updated when updating this
export function projectList(list) {
  return {
    name: list.name,
    items: list.items,
    createdAt: list.createdAt,
  };
}

export async function sendEmail(reciepient, subject, emailHtml, emailText) {
  // Uses AWS SMTP endpoint (as opposed to aws sdk)
  const transporter = nodemailer.createTransport({
    host: process.env.SES_ENDPOINT,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SES_USER,
      pass: process.env.SES_PASS,
    },
  });
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: reciepient,
    subject: subject,
    html: emailHtml,
    text: emailText,
  });
  if (info.rejected.length > 0) {
    throw new Error("Failed to send email, response: " + info.response);
  }
}

export async function sendEmailGmail(
  reciepient,
  subject,
  emailHtml,
  emailText,
) {
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
    to: reciepient,
    subject: subject,
    html: emailHtml,
    text: emailText,
  });
  if (info.rejected.length > 0) {
    throw new Error("Failed to send email, response: " + info.response);
  }
}

// export async function sendEmailSES(reciepient, subject, emailHtml, emailText) {
//   const ses = new aws.SES({
//     apiVersion: "2010-12-01",
//     region: "us-east-1",
//     credentials: {
//       // These would need to point to IAM user with SES permissions
//       accessKeyId: process.env.SES_ACCESS_KEY_ID,
//       secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
//     },
//   });
//
//   let transporter = nodemailer.createTransport({
//     SES: { ses, aws },
//   });
//
//   // send some mail
//   transporter.sendMail(
//     {
//       from: "mail@starwarstl.com",
//       to: reciepient,
//       subject: subject,
//       text: emailText,
//       html: emailHtml,
//       ses: {
//         // optional extra arguments for SendRawEmail
//       },
//     },
//     (err, info) => {
//       console.log(err);
//       console.log(info);
//     },
//   );
// }
