import dotenv from "dotenv";

const loadedEnv = dotenv.config();

if (process.env.NODE_ENV !== "production" && loadedEnv.parsed) {
  for (const [name, value] of Object.entries(loadedEnv.parsed)) {
    if (name.startsWith("MOMO_") || name.startsWith("MTN_COLLECTION_")) {
      process.env[name] = value;
    }
  }
}
