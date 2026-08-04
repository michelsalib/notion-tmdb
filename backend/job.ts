import "reflect-metadata";
import { loadEnvironmentConfig, unScopedContainer } from "./src/fx/di.js";
import { resolveEnv } from "./src/fx/env.js";
import { JobOrchestrator } from "./src/fx/scheduler/JobOrchestrator.js";

loadEnvironmentConfig(resolveEnv(process.env));

const container = await unScopedContainer("BitwardenBackup");
const orchestrator = container.resolve(JobOrchestrator);

await orchestrator.start();
