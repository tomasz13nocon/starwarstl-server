/**
 * This code is obsolete as of Lucia 3.0
 * 2.0 only had Mongoose adapter so writing an adapter for bare mongoDB was necessary
 */

export const mongodb = (db) => {
  const users = db.collection("users");
  const keys = db.collection("keys");
  const sessions = db.collection("sessions");

  return (LuciaError) => ({
    getUser: async (userId) => {
      return transformDoc(await users.findOne({ _id: userId }));
    },
    setUser: async (user, key) => {
      if (key) {
        const refKeyDoc = await keys.findOne({ _id: key.id });
        if (refKeyDoc) throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
      }
      const userDoc = createMongoValues(user);
      await users.insertOne(userDoc);
      if (!key) return;
      try {
        const keyDoc = createMongoValues(key);
        await keys.insertOne(keyDoc);
      } catch (error) {
        // await keys.deleteOne({ _id: user.id }); // Why delete especially before checking if duplicate?
        if (
          error instanceof Error &&
          error.message.includes("E11000") &&
          error.message.includes("id")
        ) {
          throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
        }
        throw error;
      }
    },
    deleteUser: async (userId) => {
      await users.deleteOne({ _id: userId });
    },
    updateUser: async (userId, partialUser) => {
      await users.updateOne({ _id: userId }, { $set: partialUser });
    },

    getSession: async (sessionId) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }
      return transformDoc(await sessions.findOne({ _id: sessionId }));
    },
    getSessionsByUserId: async (userId) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }
      const foundSessions = await sessions.find({ userId: userId });
      return foundSessions.map((val) => transformDoc(val));
    },
    getSessionAndUserBySessionId: async (sessionId) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }

      const sessionUsersCursor = await sessions.aggregate([
        { $match: { _id: sessionId } },
        {
          $lookup: {
            from: "users", // TODO parametrize
            localField: "userId",
            // Relies on _id being a String, not ObjectId.
            // But this assumption is used elsewhere, as well
            foreignField: "_id",
            as: "userDocs",
          },
        },
      ]);

      const sessionUser = sessionUsersCursor.next() ?? null;
      if (!sessionUser) return null;

      const { userDocs, ...sessionDoc } = sessionUser;
      const userDoc = userDocs?.at(0) ?? null;
      if (!userDoc) return null;

      return {
        user: transformDoc(userDoc),
        session: transformDoc(sessionDoc),
      };
    },
    setSession: async (session) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }
      await sessions.insertOne(createMongoValues(session));
    },
    deleteSession: async (sessionId) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }
      await sessions.deleteOne({ _id: sessionId });
    },
    deleteSessionsByUserId: async (userId) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }
      await sessions.deleteMany({ userId });
    },
    updateSession: async (sessionId, partialSession) => {
      if (!sessions) {
        throw new Error("Session collection not defined");
      }
      await sessions.updateOne({ _id: sessionId }, { $set: partialSession });
    },

    getKey: async (keyId) => {
      return transformDoc(await keys.findOne({ _id: keyId }));
    },
    setKey: async (key) => {
      try {
        await keys.insertOne(createMongoValues(key));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("E11000") &&
          error.message.includes("id")
        ) {
          throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
        }
        throw error;
      }
    },
    getKeysByUserId: async (userId) => {
      const keyDocs = await keys.find({ userId: userId });
      return keyDocs.map((val) => transformDoc(val));
    },
    deleteKey: async (keyId) => {
      await keys.deleteOne({ _id: keyId });
    },
    deleteKeysByUserId: async (userId) => {
      await keys.deleteMany({
        userId: userId,
      });
    },
    updateKey: async (keyId, partialKey) => {
      await keys.updateOne({ _id: keyId }, { $set: partialKey });
    },
  });
};

export const createMongoValues = (object) => {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => {
      if (key === "id") return ["_id", value];
      return [key, value];
    }),
  );
};

export const transformDoc = (row) => {
  if (!row) return null;
  const { _id: id, ...attributes } = row;
  return {
    id,
    ...attributes,
  };
};
