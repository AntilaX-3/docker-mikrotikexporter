import express from 'express';
import Prometheus from 'prom-client';
import loadConfig from './config';
import { RouterOSClient } from 'routeros-client';

const config = loadConfig('/config/mikrotikexporter.json', [
  'attributes',
]);

const port = config.port || 9120;
const scrapeInterval = (config.scrapeInterval || 15) * 1000;
const defaultMetrics = Prometheus.collectDefaultMetrics({ timeout: scrapeInterval });

const exit = (err) => {
  console.log(err);
  process.exit(1);
};

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

router.connect().then((client) => {
  const menuItems = {};
  console.log(`Connected to routeros at ${routerClientDetails.host}`);

  // Generate object containing all stream types of attributes
  /*const streams = */
  config.attributes.filter(attribute => attribute.type === 'stream').map((attribute) => {
    const { command, help, menu, metrics, name, where } = attribute;
    const onData = (reporters) => (err, data) => {
      if (err) {
        exit(err);
      }
      // Data for stream received, check for wanted metrics
      reporters.forEach((reporter) => {
        if (data[0].hasOwnProperty(reporter.attribute)) {
          // TODO: ADD LABELS
          reporter.gauge.set(data[0][reporter.attribute]);
        }
      });
    };

    // Generate menu item if it doesn't exist
    if (!menuItems.hasOwnProperty(menu)) {
      menuItems[menu] = client.menu(menu);
    }

    // Generate Prometheus reporter
    const reporters = metrics.map((metric) => {
      return {
        ...metric,
        gauge: new Prometheus.Gauge({
          name: `mikrotikexporter_${name.trim().replace(/ +/g, '_').toLowerCase()}_${metric.name.trim().replace(/ +/g, '_').toLowerCase()}`,
          help: help ? `${help} ${metric.help ? metric.help : ''}`.trim() : '',
        }),
      };
    });

    // Generate stream
    if (where && where.length >= 2) {
      return menuItems[menu].where(where[0], where[1]).stream(command, onData(reporters));
    } else {
      return menuItems[menu].stream(command, onData(reporters));
    }
  });

  // const scrapedMetrics = {};


  // menuItems.resource = client.menu('/system/resource');
  // menuItems.interface = client.menu('/interface');
  //
  //
  // menuItems.interface.where('interface', 'Ethernet3').stream('monitor-traffic', (err, data) => {
  //   if (err) {
  //     console.log(err);
  //     return;
  //   }
  //
  //   console.log(data);
  // });

  // routerosMenuItems.resource.getOne().then((resources) => {
  //   console.log(resources);
  // }).catch((err) => {
  //   console.log(err);
  // });


  const getMetrics = () => {
    const gatherAsync = async () => {

    };

    gatherAsync()
      .catch((err) => {
        console.log(err);
      });
  };

  // Start a timer to fetch metrics
  setInterval(getMetrics, scrapeInterval);

  // Get initial metrics
  getMetrics();

})
  .catch((err) => {
    console.log('Unable to connect to router');
    console.log(err);
    process.exit(1);
  });

router.on('error', (err) => {
  console.log(err);
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