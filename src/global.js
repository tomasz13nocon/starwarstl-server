export const env = process.env.NODE_ENV || "dev"; // dev | prod
export const dev = env === "dev";
export const prod = env === "prod";
