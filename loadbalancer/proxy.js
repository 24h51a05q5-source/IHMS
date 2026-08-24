/**
 * IHMS Scalable Reverse Proxy & Load Balancer
 * 
 * Features:
 * - Load Balancing Strategies: 'least-connections' (default) & 'round-robin'
 * - Active Background Health Check Monitoring against /api/health
 * - Zero-downtime Automatic Failover: routes requests away from unhealthy nodes
 * - Automatic Recovery: re-admits nodes as soon as they pass health checks
 * - Transparent Header Forwarding (X-Forwarded-For, X-Forwarded-Proto, X-Handled-By)
 * - WebSocket & HTTP/1.1 Streaming Support
 * - Real-time Cluster Dashboard at /lb-status
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '5000', 10);
const STRATEGY = process.env.LB_STRATEGY || 'least-connections'; // 'least-connections' or 'round-robin'
const HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '2500', 10);
const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '2000', 10);

// Cluster target instances
const rawInstances = process.env.UPSTREAM_SERVERS
  ? process.env.UPSTREAM_SERVERS.split(',').map(s => s.trim())
  : ['http://127.0.0.1:5001', 'http://127.0.0.1:5002', 'http://127.0.0.1:5003'];

const servers = rawInstances.map((targetUrl, idx) => {
  const parsed = new URL(targetUrl);
  return {
    id: `app-server-${idx + 1}`,
    url: targetUrl,
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '5000', 10),
    healthy: true,
    consecutiveFailures: 0,
    activeConnections: 0,
    totalRequests: 0,
    failedRequests: 0,
    lastLatencyMs: 0,
    lastChecked: null,
    uptimeSeconds: 0,
    databaseStatus: 'unknown',
  };
});

let roundRobinIndex = 0;

/**
 * Health Check Prober
 * Sends a GET request to /api/health on each backend instance
 */
function checkServerHealth(server) {
  const start = Date.now();
  const req = http.get(
    {
      hostname: server.host,
      port: server.port,
      path: '/api/health',
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    },
    (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const latency = Date.now() - start;
        server.lastLatencyMs = latency;
        server.lastChecked = new Date().toISOString();

        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            server.databaseStatus = parsed?.database?.status || 'connected';
            server.uptimeSeconds = parsed?.uptimeSeconds || 0;
          } catch {
            server.databaseStatus = 'connected';
          }

          if (!server.healthy) {
            console.log(`[Load Balancer] 🟢 Instance ${server.id} (${server.url}) is now HEALTHY and active in pool.`);
          }
          server.healthy = true;
          server.consecutiveFailures = 0;
        } else {
          server.consecutiveFailures++;
          if (server.healthy && server.consecutiveFailures >= 2) {
            server.healthy = false;
            console.warn(`[Load Balancer] 🔴 Instance ${server.id} (${server.url}) returned HTTP ${res.statusCode}. Marked UNHEALTHY.`);
          }
        }
      });
    }
  );

  req.on('timeout', () => {
    req.destroy();
    server.consecutiveFailures++;
    if (server.healthy && server.consecutiveFailures >= 2) {
      server.healthy = false;
      console.warn(`[Load Balancer] 🔴 Instance ${server.id} (${server.url}) timed out during health check. Marked UNHEALTHY.`);
    }
  });

  req.on('error', () => {
    server.consecutiveFailures++;
    if (server.healthy && server.consecutiveFailures >= 2) {
      server.healthy = false;
      console.warn(`[Load Balancer] 🔴 Instance ${server.id} (${server.url}) connection failed. Marked UNHEALTHY.`);
    }
  });
}

function startHealthChecks() {
  servers.forEach(checkServerHealth);
  setInterval(() => {
    servers.forEach(checkServerHealth);
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Select next healthy server based on configured strategy
 */
function getNextServer() {
  const healthyServers = servers.filter(s => s.healthy);
  if (healthyServers.length === 0) {
    // If all are marked unhealthy, fallback to least connections among all to attempt recovery
    return servers.reduce((prev, curr) => (curr.activeConnections < prev.activeConnections ? curr : prev), servers[0]);
  }

  if (STRATEGY === 'least-connections') {
    let minConns = Infinity;
    const candidates = [];
    for (const s of healthyServers) {
      if (s.activeConnections < minConns) {
        minConns = s.activeConnections;
        candidates.length = 0;
        candidates.push(s);
      } else if (s.activeConnections === minConns) {
        candidates.push(s);
      }
    }
    const chosen = candidates[roundRobinIndex % candidates.length];
    roundRobinIndex = (roundRobinIndex + 1) % 1000000;
    return chosen;
  }

  // Round Robin
  const selected = healthyServers[roundRobinIndex % healthyServers.length];
  roundRobinIndex = (roundRobinIndex + 1) % healthyServers.length;
  return selected;
}

/**
 * HTTP Reverse Proxy Server
 */
const proxyServer = http.createServer((clientReq, clientRes) => {
  // Cluster Dashboard Endpoint
  if (clientReq.url === '/lb-status') {
    clientRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    clientRes.end(JSON.stringify({
      cluster: 'IHMS Multi-Instance Application Cluster',
      loadBalancerPort: PROXY_PORT,
      strategy: STRATEGY,
      totalInstances: servers.length,
      healthyInstances: servers.filter(s => s.healthy).length,
      timestamp: new Date().toISOString(),
      instances: servers.map(s => ({
        id: s.id,
        url: s.url,
        healthy: s.healthy,
        activeConnections: s.activeConnections,
        totalRequests: s.totalRequests,
        failedRequests: s.failedRequests,
        latencyMs: s.lastLatencyMs,
        uptimeSeconds: s.uptimeSeconds,
        databaseStatus: s.databaseStatus,
        lastChecked: s.lastChecked,
      })),
    }, null, 2));
    return;
  }

  // CORS Preflight
  if (clientReq.method === 'OPTIONS') {
    clientRes.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-razorpay-signature, x-webhook-signature, signature',
      'Access-Control-Max-Age': '86400',
    });
    clientRes.end();
    return;
  }

  const target = getNextServer();
  target.activeConnections++;
  target.totalRequests++;

  const options = {
    hostname: target.host,
    port: target.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: clientReq.headers.host || `${target.host}:${target.port}`,
      'x-forwarded-for': clientReq.headers['x-forwarded-for']
        ? `${clientReq.headers['x-forwarded-for']}, ${clientReq.socket.remoteAddress}`
        : clientReq.socket.remoteAddress,
      'x-forwarded-proto': clientReq.socket.encrypted ? 'https' : 'http',
      'x-forwarded-host': clientReq.headers.host,
      'x-forwarded-port': String(PROXY_PORT),
    },
    timeout: 30000,
  };

  const proxyReq = http.request(options, (upstreamRes) => {
    // Add load balancer tracking headers
    const responseHeaders = { ...upstreamRes.headers };
    responseHeaders['x-load-balancer'] = 'IHMS-ReverseProxy/1.0';
    responseHeaders['x-lb-target'] = target.id;
    responseHeaders['access-control-allow-origin'] = '*';

    clientRes.writeHead(upstreamRes.statusCode || 200, responseHeaders);
    upstreamRes.pipe(clientRes);

    upstreamRes.on('end', () => {
      target.activeConnections = Math.max(0, target.activeConnections - 1);
    });
  });

  proxyReq.on('error', (err) => {
    target.activeConnections = Math.max(0, target.activeConnections - 1);
    target.failedRequests++;
    target.consecutiveFailures++;

    console.error(`[Load Balancer] Error proxying to ${target.id}: ${err.message}. Attempting instant failover retry...`);
    
    // Automatic Failover: Try alternative healthy server
    const fallback = servers.find(s => s.id !== target.id && s.healthy);
    if (fallback) {
      fallback.activeConnections++;
      fallback.totalRequests++;

      const retryOptions = {
        ...options,
        hostname: fallback.host,
        port: fallback.port,
        headers: {
          ...options.headers,
          host: clientReq.headers.host || `${fallback.host}:${fallback.port}`,
        },
      };

      const retryReq = http.request(retryOptions, (fallbackRes) => {
        const fallbackHeaders = { ...fallbackRes.headers };
        fallbackHeaders['x-load-balancer'] = 'IHMS-ReverseProxy/1.0';
        fallbackHeaders['x-lb-target'] = `${fallback.id} (failover)`;
        fallbackHeaders['access-control-allow-origin'] = '*';

        clientRes.writeHead(fallbackRes.statusCode || 200, fallbackHeaders);
        fallbackRes.pipe(clientRes);

        fallbackRes.on('end', () => {
          fallback.activeConnections = Math.max(0, fallback.activeConnections - 1);
        });
      });

      retryReq.on('error', () => {
        fallback.activeConnections = Math.max(0, fallback.activeConnections - 1);
        fallback.failedRequests++;
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          clientRes.end(JSON.stringify({ error: 'Bad Gateway: Upstream cluster failure', status: 502 }));
        }
      });

      clientReq.pipe(retryReq);
    } else {
      if (!clientRes.headersSent) {
        clientRes.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        clientRes.end(JSON.stringify({ error: 'Service Unavailable: No healthy backend servers available', status: 503 }));
      }
    }
  });

  clientReq.pipe(proxyReq);
});

// WebSocket Upgrade Support (/socket.io/)
proxyServer.on('upgrade', (req, socket, head) => {
  const target = getNextServer();
  const options = {
    hostname: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options);
  proxyReq.on('upgrade', (res, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n` +
      Object.keys(res.headers).map(h => `${h}: ${res.headers[h]}`).join('\r\n') +
      '\r\n\r\n');
    if (upstreamHead && upstreamHead.length > 0) socket.unshift(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  proxyReq.on('error', () => {
    socket.destroy();
  });

  proxyReq.end();
});

proxyServer.listen(PROXY_PORT, () => {
  console.log('================================================================');
  console.log(`  🌐 IHMS REVERSE PROXY & LOAD BALANCER LISTENING ON :${PROXY_PORT}`);
  console.log(`  ⚖️  Balancing Strategy: ${STRATEGY.toUpperCase()}`);
  console.log(`  🎯 Upstream Application Instances:`);
  servers.forEach(s => {
    console.log(`     - [${s.id}] -> ${s.url}`);
  });
  console.log(`  📊 Cluster Health Status: http://localhost:${PROXY_PORT}/lb-status`);
  console.log('================================================================');
  startHealthChecks();
});
