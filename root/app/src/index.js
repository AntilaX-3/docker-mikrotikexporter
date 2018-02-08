import express from 'express';
import Prometheus from 'prom-client';
import { RouterOSClient } from 'routeros-client';

import loadConfig from './config';
import stream from './types/stream';
import get from './types/get';

const config = loadConfig('/config/mikrotikexporter.json', [
  'attributes',
]);

const port = config.port || 9120;
const scrapeInterval = (config.scrapeInterval || 15) * 1000;
const defaultMetrics = Prometheus.collectDefaultMetrics({ timeout: scrapeInterval });

const routerClientDetailsFromEnv = {
  host: process.env.ME_HOST,
  user: process.env.ME_USER,
  password: process.env.ME_PASSWORD,
};

const routerClientDetails = {
  // Timeout can be overwritten by config.router
  timeout: 30,
  ...config.router, // undefined by default
  // Environment variables take priority
  ...routerClientDetailsFromEnv,
  keepalive: true,
};

// Check either enviromental or JSON login details were set
const requiredKeys = [
  { key: 'host', type: 'string', minLen: 6, error: 'host or IP address' },
  { key: 'user', type: 'string', minLen: 1, error: 'username' },
  { key: 'password', type: 'string', minLen: 1, error: 'password' },
];

requiredKeys.forEach((requiredKey) => {
  if (
    !routerClientDetails[requiredKey.key] ||
    typeof routerClientDetails[requiredKey.key] !== requiredKey.type ||
    routerClientDetails[requiredKey.key].length < requiredKey.minLen
  ) {
    console.log(`Invalid ${requiredKey.key}! Provide environment variable ME_${requiredKey.key.toUpperCase()} with a valid ${requiredKey.error}.`);
    process.exit(1);
  }
});

const router = new RouterOSClient(routerClientDetails);
const connect = () => {
  router.connect().then((client) => {
    const menuItems = {};
    const reporters = {};
    console.log(`Connected to routeros at ${routerClientDetails.host}`);

    // Generate all stream types of attributes
    config.attributes.filter(attribute => attribute.type === 'stream').map((attribute) => stream(
      attribute,
      client,
      menuItems,
      reporters,
    ));

    // Generate array of functions containing all 'get' types of attributes
    const scrapedMetrics = config.attributes.filter(attribute => attribute.type.startsWith('get')).map((attribute) => get(
      attribute,
      client,
      menuItems,
      reporters,
    ));

    const getMetrics = () => {
      scrapedMetrics.forEach((metric) => {
        metric();
      });
    };

    // Start a timer to fetch metrics
    setInterval(getMetrics, scrapeInterval);

    // Get initial metrics
    getMetrics();
  })
    .catch((err) => {
      console.log('Unable to connect to router, re-trying in 5 seconds');
      console.log(err);
      setTimeout(connect, 5000);
    });
};

router.on('error', (err) => {
  console.log(err);
  setTimeout(connect, 5000);
});

// Setup our HTTP webserver
const app = express();
app.get('/', (req, res, next) => {
  setTimeout(() => {
    res.send('Point Prometheus here for your RouterOS statistics');
    next();
  }, Math.round(Math.random() * 200));
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

app.use((err, req, res, next) => {
  res.statusCode = 500;

  // Dev only:
  //res.json({ error: err.message });
  next();
});

const server = app.listen((port), () => {
  console.log(`Running mikrotikexporter. Listening on port ${port}.`);
  connect();
});

// Shutdown gracefully
process.on('SIGTERM', () => {
  clearInterval(defaultMetrics);
  server.close((err) => {
    if (err) {
      console.log(err);
      process.exit(1);
    }
    process.exit(0);
  });
});