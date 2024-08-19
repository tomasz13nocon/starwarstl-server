import { auth } from "./auth.js";
import { verifyRequestOrigin } from "lucia";
import { ClientError, dev, logError } from "./global.js";

// CSRF protection using Origin header, might not work in some pre 2020 browsers
export function csrf(req, res, next) {
  if (req.method === "GET" || dev) {
    return next();
  }
  const originHeader = req.headers.origin ?? null;
  // NOTE: You may need to use `X-Forwarded-Host` instead
  const hostHeader = req.headers.host ?? null;

  if (
    !originHeader ||
    !hostHeader ||
    !verifyRequestOrigin(originHeader, [hostHeader])
  ) {
    // TODO log, analytics
    console.error("Origin:", originHeader);
    console.error("Host:", hostHeader);
    return res.status(403).json({});
  }
  next();
}

// Accept only JSON and no body requests
export function jsonOnly(req, res, next) {
  // is() returns null for empty body (which we accept), false for other content types
  // The problem here is POST and DELETE requests (at least) send 'Content-length=0' in requests with no body.
  // request.is() uses 'type-is' library which checks for the presence of 'Content-length'
  // So we need to check for 'content-length' manually
  if (
    req.is("application/json") === false &&
    req.headers["content-length"] !== "0"
  ) {
    res.status(415).json({ error: "Only JSON is allowed" });
  } else {
    next();
  }
}

// Auth middleware (reads cookies, handles sessions, sets locals)
export async function authSetup(req, res, next) {
  const sessionId = auth.readSessionCookie(req.headers.cookie ?? "");
  if (!sessionId) {
    res.locals.user = null;
    res.locals.session = null;
    return next();
  }

  const { session, user } = await auth.validateSession(sessionId);
  if (session && session.fresh) {
    res.appendHeader(
      "Set-Cookie",
      auth.createSessionCookie(session.id).serialize(),
    );
  }
  if (!session) {
    res.appendHeader("Set-Cookie", auth.createBlankSessionCookie().serialize());
  }
  res.locals.user = user;
  res.locals.session = session;
  return next();
}

// Auth middleware (401 if not authenticated)
export function authenticate(req, res, next) {
  if (!res.locals.session)
    throw new ClientError(
      401,
      "This action requires you to be logged in",
      false,
    );
  next();
}

// Global error handler
export function errorHandler(err, req, res, next) {
  // Standard, expected errors, no need to log these
  if (err instanceof ClientError) {
    if (err.shouldLog) logError(err, req);
    return res.status(err.statusCode).json({ error: err.message });
  }

  logError(err, req);

  // request JSON parse error
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: err.message });
  }

  return res.status(err.status ?? err.statusCode ?? 500).json({
    error: "An unknown error occurred",
  });
}
