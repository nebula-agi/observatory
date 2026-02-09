import { CheckpointManager } from "../src/orchestrator/checkpoint";

const runId = process.argv[2];
if (!runId) {
    console.error("Please provide a runId");
    process.exit(1);
}

const checkpointManager = new CheckpointManager();
const checkpoint = checkpointManager.load(runId);

if (!checkpoint) {
    console.error(`Checkpoint not found for runId: ${runId}`);
    process.exit(1);
}

console.log(`Resetting search, answer, and evaluate phases for run: ${runId}`);

for (const qId in checkpoint.questions) {
    const q = checkpoint.questions[qId];
    q.phases.search = { status: "pending" };
    q.phases.answer = { status: "pending" };
    q.phases.evaluate = { status: "pending" };
}

checkpoint.status = "running";
checkpointManager.save(checkpoint);

console.log("Successfully reset phases. You can now rerun the search phase using:");
console.log(`bun run src/index.ts run -r ${runId} -f search`);
