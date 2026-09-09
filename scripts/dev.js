const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

console.log('====================================================');
console.log('  🚀 Starting Integrated Hostel Management System (IHMS)');
console.log('  📍 Environment: LOCAL DEVELOPMENT');
console.log('  🌐 Frontend:    http://localhost:3000');
console.log('  ⚙️  Backend:     http://localhost:5000');
console.log('  🐘 Database:    Local / Embedded PostgreSQL');
console.log('====================================================\n');

// 1. Launch Backend (Port 5000)
const backend = spawn(npmCmd, ['--workspace=backend', 'run', 'start:dev'], {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '5000',
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://localhost:3000',
    BACKEND_URL: 'http://localhost:5000',
    NEXT_PUBLIC_API_URL: 'http://localhost:5000/api',
  },
});

// 2. Launch Frontend (Port 3000)
const frontend = spawn(npmCmd, ['--workspace=frontend', 'run', 'dev'], {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3000',
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://localhost:3000',
    BACKEND_URL: 'http://localhost:5000',
    NEXT_PUBLIC_API_URL: 'http://localhost:5000/api',
    NEXT_PUBLIC_SOCKET_URL: 'http://localhost:5000',
  },
});

function cleanup() {
  console.log('\n[Dev Server] Shutting down IHMS local servers...');
  try {
    if (isWin) {
      if (backend.pid) spawn('taskkill', ['/pid', backend.pid.toString(), '/f', '/t']);
      if (frontend.pid) spawn('taskkill', ['/pid', frontend.pid.toString(), '/f', '/t']);
    } else {
      backend.kill('SIGINT');
      frontend.kill('SIGINT');
    }
  } catch (e) {
    // ignore cleanup errors
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
