import { MongoClient } from "mongodb";
import "reflect-metadata";
import { loadEnvironmentConfig, unScopedContainer } from "./src/fx/di.js";
import { resolveEnv } from "./src/fx/env.js";
import { JobOrchestrator } from "./src/fx/scheduler/JobOrchestrator.js";

loadEnvironmentConfig(resolveEnv(process.env));

const container = await unScopedContainer("BitwardenBackup");
const orchestrator = container.resolve(JobOrchestrator);

try {
  await orchestrator.start();
} finally {
  // The Mongo singleton's socket and topology heartbeat keep the event loop
  // alive, so without this the task sits idle after the last backup until Cloud
  // Run's 1800s timeout kills it. It went unnoticed because the Job had never
  // once finished its work: every execution ended on an unhandled error, and
  // that terminated the process for us.
  await container.resolve(MongoClient).close();
}

// Belt and braces — the GCS client can hold keep-alive sockets of its own, and
// everything worth waiting on has already been awaited above. On failure the
// error from start() propagates instead, exiting non-zero.
process.exit(0);
