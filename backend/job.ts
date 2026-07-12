import "reflect-metadata";
import { loadEnvironmentConfig, unScopedContainer } from "./src/fx/di.js";
import { JobOrchestrator } from "./src/fx/scheduler/JobOrchestrator.js";

loadEnvironmentConfig(process.env);

const container = await unScopedContainer("BitwardenBackup");
const orchestrator = container.resolve(JobOrchestrator);

await orchestrator.start();
