import crypto from "crypto";
import fetch from "fetch-with-proxy";
import invariant from "invariant";
import Collection from "@server/models/Collection";
import Document from "@server/models/Document";
import Team from "@server/models/Team";
import User from "@server/models/User";
import packageInfo from "../../package.json";
import { client } from "../redis";

const UPDATES_URL = "https://updates.getoutline.com";
const UPDATES_KEY = "UPDATES_KEY";

export async function checkUpdates() {
  invariant(
    process.env.SECRET_KEY && process.env.URL,
    "SECRET_KEY or URL env var is not set"
  );
  const secret = process.env.SECRET_KEY.slice(0, 6) + process.env.URL;
  const id = crypto.createHash("sha256").update(secret).digest("hex");
  const [
    userCount,
    teamCount,
    collectionCount,
    documentCount,
  ] = await Promise.all([
    User.count(),
    Team.count(),
    Collection.count(),
    Document.count(),
  ]);
  const body = JSON.stringify({
    id,
    version: 1,
    clientVersion: packageInfo.version,
    analytics: {
      userCount,
      teamCount,
      collectionCount,
      documentCount,
    },
  });
  await client.del(UPDATES_KEY);

  try {
    const response = await fetch(UPDATES_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body,
    });
    const data = await response.json();

    if (data.severity) {
      await client.set(
        UPDATES_KEY,
        JSON.stringify({
          severity: data.severity,
          message: data.message,
          url: data.url,
        })
      );
    }
  } catch (_e) {
    // no-op
  }
}
