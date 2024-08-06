import { ClientError } from "../global.js";

// Does not check uniqeness, since unique index exists on lists. E11000 gets thrown if duplicate
export function validateListName(name) {
  if (typeof name === "string" && name.length > 0 && name.length <= 64) return;
  throw new ClientError(422, "Invalid list name");
}

export function validatePageids(pageids) {
  if (
    Array.isArray(pageids) &&
    pageids.every((pageid) => Number.isInteger(pageid) && pageid >= 0)
  )
    return;
  throw new ClientError(422, "Invalid pageids");
}

export function validateEmail(email) {
  if (typeof email === "string" && /.+@.+\..+/.test(email)) return;
  throw new ClientError(422, "Invalid email");
}

export function validateUsername(name) {
  if (typeof name === "string" && name.length >= 3 && name.length <= 32) return;
  throw new ClientError(422, "Invalid username");
}

export function validatePassword(password) {
  if (typeof password === "string" && password.length >= 6) return;
  throw new ClientError(422, "Invalid password");
}
