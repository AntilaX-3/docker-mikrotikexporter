import express from 'express';
import Prometheus from 'prom-client';
import fs from 'fs';
import defConfig from './config/default';
import { RouterOSClient } from 'routeros-client';

// Attempt to read configuration file
let config;
let metricsTimer;

const copyDefaultConfigFile = (err, copyFile = false) => {
  console.log(err);
  config = defConfig;
  if (copyFile) {
    fs.writeFile('/config/mikrotikexporter.json', `${JSON.stringify(defConfig, null, 2)}\n`, 'utf8', (err) => {
      if (err) {
        console.log('Error writing to /config/mikrotikexporter.json', err);
        process.exit(1);
      }
      console.log('Copied default config to /config/mikrotikexporter.json');
      process.exit(1);
    });
  }
};

if (fs.existsSync('/config/mikrotikexporter.json')) {
  // Read config file
  const fileContents = fs.readFileSync('/config/mikrotikexporter.json', 'utf8');

  if (fileContents) {
    try {
      config = JSON.parse(fileContents);

      if (!config || !config.routeros) {
        copyDefaultConfigFile(`Missing required field 'routeros' from the configuration file.`);
      }
    } catch (err) {
      copyDefaultConfigFile(`Unable to parse configuration file, please check JSON validity. Error: ${err}`);
    }
  }
} else {
  copyDefaultConfigFile('Unable to find configuration file', true);
}

const port = config.port || 9120;
const scrapeInterval = (config.scrapeInterval || 15) * 1000;
const defaultMetrics = Prometheus.collectDefaultMetrics({ timeout: scrapeInterval });

const routerosClientDetailsFromEnv = {
  host: process.env.ME_HOST,
  user: process.env.ME_USER,
  password: process.env.ME_PASS,
};

const routerosClientDetails = {
  timeout: 30,
  ...config.routeros,
  ...routerosClientDetailsFromEnv,
  keepalive: true,
};

console.log(routerosClientDetails);

const routeros = new RouterOSClient(routerosClientDetails);
const routerosMenuItems = {};

routeros.connect().then((client) => {
  console.log(`Connected to routeros at ${routerosClientDetails.host}`);

  routerosMenuItems.resource = client.menu('/system/resource');
  routerosMenuItems.interface = client.menu('/interface');


  routerosMenuItems.interface.where('interface', 'Ethernet3').stream('monitor-traffic', (err, data) => {
    if (err) {
      console.log(err);
      return;
    }

    console.log(data);
  });

  // routerosMenuItems.resource.getOne().then((resources) => {
  //   console.log(resources);
  // }).catch((err) => {
  //   console.log(err);
  // });


})
  .catch((err) => {
    console.log(err);

    process.exit(1);
  });

routeros.on('error', (err) => {
  console.log(err);
});


const getMetrics = () => {
  const gatherAsync = async () => {

  };

  gatherAsync()
    .catch((err) => {
      console.log(err);
    });
};


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

  // Start a timer to fetch metrics
  metricsTimer = setInterval(getMetrics, scrapeInterval);

  // Get initial metrics
  getMetrics();
});

// Shutdown gracefully
process.on('SIGTERM', () => {
  clearInterval(defaultMetrics);
  clearInterval(metricsTimer);

  server.close((err) => {
    if (err) {
      console.log(err);
      process.exit(1);
    }

    process.exit(0);
  });
});