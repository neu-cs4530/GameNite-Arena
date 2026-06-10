import { InMemoryMatchRepo } from "./matchRepo.service.ts";

// shared replay storage backing both the recorder and the download endpoint.
// in-memory for now; swap for the db-backed repo once the schema lands.
export const replayRepo = new InMemoryMatchRepo();
