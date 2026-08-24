/**
 * IHMS Multi-Instance Cluster Orchestrator
 * Spawns multiple stateless application server instances across ports
 */

const { fork } = require('child_process');
const path = require('path');

const NUM_INSTANCES = parseInt(process.env.CLUSTER_INSTANCES || '3', 10);
const BASE_PORT = parseInt(process.env.BASE_PORT || '5001', 10);
const serverPath = path.resolve(__dirname, 'dist/src/main.js');

const instances = [];

console.log('================================================================');
console.log(`  🚀 STARTING IHMS APPLICATION CLUSTER (${NUM_INSTANCES} INSTANCES)`);
console.log('================================================================');

function startInstance(index) {
  const port = BASE_PORT + index;
  const instanceId = `app-server-${index + 1}`;

  const env = {
    ...process.env,
    PORT: String(port),
    INSTANCE_ID: instanceId,
  };

  const child = fork(serverPath, [], {
    cwd: __dirname,
    env,
    stdio: 'inherit',
  });

  instances[index] = { child, port, instanceId };

  child.on('exit', (code, signal) => {
    console.warn(`[Cluster Manager] ⚠️ Instance ${instanceId} (port ${port}) exited with code ${code} signal ${signal}. Respawning in 2s...`);
    setTimeout(() => {
      startInstance(index);
    }, 2000);
  });

  console.log(`[Cluster Manager] 🌟 Launched ${instanceId} on port ${port}`);
}

for (let i = 0; i < NUM_INSTANCES; i++) {
  startInstance(i);
}

// Graceful shutdown of entire cluster
function handleShutdown(signal) {
  console.log(`\n[Cluster Manager] Received ${signal}. Stopping all instances...`);
  instances.forEach(({ child, instanceId }) => {
    if (child && !child.killed) {
      console.log(`[Cluster Manager] Sending SIGTERM to ${instanceId}...`);
      child.kill('SIGTERM');
    }
  });
  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
