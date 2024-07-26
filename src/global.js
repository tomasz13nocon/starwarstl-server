export const env = process.env.NODE_ENV || "dev"; // dev | prod
export const dev = env === "dev";
export const prod = env === "prod";

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
