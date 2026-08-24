/**
 * PM2 Multi-Instance Cluster Configuration for IHMS ERP
 */

module.exports = {
  apps: [
    {
      name: 'ihms-app-1',
      script: './backend/dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
        INSTANCE_ID: 'app-server-1',
      },
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'ihms-app-2',
      script: './backend/dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        INSTANCE_ID: 'app-server-2',
      },
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'ihms-app-3',
      script: './backend/dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
        INSTANCE_ID: 'app-server-3',
      },
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'ihms-load-balancer',
      script: './loadbalancer/proxy.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROXY_PORT: 5000,
        LB_STRATEGY: 'least-connections',
        UPSTREAM_SERVERS: 'http://127.0.0.1:5001,http://127.0.0.1:5002,http://127.0.0.1:5003',
      },
    },
  ],
};
