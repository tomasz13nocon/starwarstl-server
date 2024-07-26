import { ClientError, builtinLists, projectList } from "../global.js";
import { getDatabase } from "../db.js";
import { validateListName, validatePageids } from "./validators.js";

let db = await getDatabase();

export const getUserLists = async (req, res) => {
  let lists = await db
    .collection("lists")
    .find({ userId: res.locals.user.id })
    .toArray();

  res.json(lists);
};

export const getUserList = async (req, res) => {
  let { listName } = req.params;

  validateListName(listName);

  let result = await db
    .collection("lists")
    .aggregate(
      [
        {
          $match: {
            userId: res.locals.user.id,
            name: listName,
          },
        },
        {
          $lookup: {
            from: "media",
            localField: "items",
            foreignField: "pageid",
            as: "itemsTemp",
          },
        },
        {
          // This is needed, because if `items` is an empty array, it matches all media where pageid is not present ([] == undefined apparently)
          $addFields: {
            items: {
              $cond: {
                if: { $eq: ["$items", []] },
                then: [],
                else: "$itemsTemp",
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            name: 1,
            createdAt: 1,
            "items.title": 1,
            "items.type": 1,
            "items.fullType": 1,
            "items.pageid": 1,
          },
        },
      ],
      { collation: { locale: "en", strength: 2 } },
    )
    .next();

  // List doesn't exist
  if (result === null) {
    // This could happen upon navigation to deleted list, no need to log
    throw new ClientError(404, "List doesn't exist", false);
  }

  res.json(projectList(result));
};

export const addToList = async (req, res) => {
  let { listName } = req.params;
  let { pageids } = req.body;

  validateListName(listName);
  validatePageids(pageids);

  // Make sure this pageid exists
  let result = await db
    .collection("media")
    .distinct("pageid", { pageid: { $in: pageids } });
  if (result.length !== pageids.length)
    throw new ClientError(422, "Some pageids are incorrect");

  // transaction
  // result = await db.collection("lists").findOne(
  //   { userId: res.locals.user.id, name: listName },
  //   {
  //     projection: { items: 1 },
  //   },
  // );
  // const countBefore = result.items.length;

  result = await db
    .collection("lists")
    .updateOne(
      { userId: res.locals.user.id, name: listName },
      { $addToSet: { items: { $each: pageids } } },
    );
  // If pageid was already in this list, do nothing

  // Trying to add to non existent list
  if (result.matchedCount === 0)
    throw new ClientError(404, `List "${listName}" doesn't exist`);

  // If adding to watched, remove from watchlist
  if (listName.toLowerCase() === "watched") {
    result = await db
      .collection("lists")
      .updateOne(
        { userId: res.locals.user.id, name: "Watchlist" },
        { $pullAll: { items: pageids } },
      );
  }

  result = await db
    .collection("lists")
    .find({ userId: res.locals.user.id })
    .sort({ createdAt: 1 })
    .toArray();

  res.status(200).json({
    lists: result.map(projectList),
  });
};

export const createList = async (req, res) => {
  let { name } = req.body;

  validateListName(name);

  const list = {
    userId: res.locals.user.id,
    name,
    items: [],
    createdAt: new Date(),
  };

  try {
    await db.collection("lists").insertOne(list);
  } catch (e) {
    // Duplicate list name
    if (e.code === 11000) {
      throw new ClientError(409, "List with this name already exists");
    } else {
      throw e;
    }
  }

  res.status(200).json(projectList(list));
};

export const deleteList = async (req, res) => {
  let { listName } = req.params;

  validateListName(listName);
  if (builtinLists.includes(listName))
    throw new ClientError(403, "Cannot delete built in lists");

  await db
    .collection("lists")
    .deleteOne({ userId: res.locals.user.id, name: listName });

  res.status(200).json({});
};

export const updateList = async (req, res) => {
  let { listName } = req.params;
  let { action, name: newName, pageids } = req.body;

  validateListName(listName);

  if (action === "renameList") {
    validateListName(newName);
    if (builtinLists.includes(listName))
      throw new ClientError(403, "Cannot rename built in lists");

    try {
      let result = await db
        .collection("lists")
        .updateOne({ name: listName }, { $set: { name: newName } });

      if (result.matchedCount === 0)
        throw new ClientError(404, "List doesn't exist");
    } catch (e) {
      // Duplicate list name
      if (e.code === 11000) {
        throw new ClientError(409, "List with this name already exists");
      } else {
        throw e;
      }
    }

    return res.status(200).json({});
  } else if (action === "removeItems") {
    validatePageids(pageids);

    let result = await db
      .collection("lists")
      .updateOne(
        { userId: res.locals.user.id, name: listName },
        { $pullAll: { items: pageids } },
      );
    // If pageid was already not in this list, do nothing

    // Trying to remove from non existent list
    if (result.matchedCount === 0)
      throw new ClientError(404, "List doesn't exist");

    return res.status(200).json({});
  } else {
    throw new ClientError(422, "Invalid action");
  }
};
