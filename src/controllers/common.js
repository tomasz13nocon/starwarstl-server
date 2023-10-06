import { auth } from "../auth.js";

export async function authenticate(req, res) {
  const authRequest = auth.handleRequest(req, res);
  return authRequest.validate();
}
