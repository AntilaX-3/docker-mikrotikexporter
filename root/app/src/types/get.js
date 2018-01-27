import Prometheus from 'prom-client';

const doConversion = ({ conversion }, data) => {
  if (typeof conversion !== 'string') return data;
  switch (conversion) {
    case 'uptime':
      // Convert Mikrotik's WEEK / DAY / HOURS / MINUTES / SECONDS uptime format
      const multipliers = [1, 60, 3600, 86400, 604800];
      return data
        .replace(/[^0-9]/g, ',') // Repalce any non-integer with a delimeter
        .split(',') // Split into an array based on the delimeter
        .reverse() // Reverse the array from w/d/h/m/s to s/m/h/d/w
        .slice(1) // Remove the first element of the array
        .map((timeSlice, idx) => timeSlice * multipliers[idx]) // Multiply the time slices
        .reduce((a, b) => a + b, 0); // Add all the numbers together
    default:
      console.log(`Unable to perform unknown conversion '${conversion}'`);
      return 0;
  }
};

export default (attribute, client, menuItems, reporters) => {
  const { labels, menu, metrics, type } = attribute;

  const onError = (err) => {
    console.log(err);
  };

  // Sanitize label names
  const labelData = { name: attribute.name };
  const labelNames = ['name'];
  if (labels && Array.isArray(labels) && labels.length) {
    labels.forEach((label) => {
      if (!Array.isArray(label) || label.length !== 2) return;
      const newLabel = label[0].replace(/ +/g, '_').toLowerCase();
      labelNames.push(newLabel);
      labelData[newLabel] = label[1];
    });
  }

  const onData = (type) => (res) => {
    // Data for get received, check for wanted metrics
    console.log(res);
    metrics.forEach((metric) => {
      if (typeof metric.name !== 'string' || (typeof metric.attribute !== 'string' && typeof metric.type !== 'string')) return;
      let data = 0;
      let pos = 0;

      // Check if metric is a special type
      if (typeof metric.type === 'string') switch (metric.type) {
        case 'count':
          // Return size of array
          data = res.length;
          break;
        default:
          return console.log(`Unknown metric type ${metric.type}`);
      } else {
        switch (type) {
          case 'get':
            if (Array.isArray(res) && res.length > pos && res[pos].hasOwnProperty(metric.attribute)) {
              data = doConversion(metric, res[pos][metric.attribute]);
            }
            break;
          case 'getOne':
            if (res.hasOwnProperty(metric.attribute)) {
              data = doConversion(metric, res[metric.attribute]);
            }
            break;
        }
      }
      reporters[metric.name].set(labelData, data);
    });
  };

  // Generate menu item if it doesn't exist
  if (!menuItems.hasOwnProperty(menu)) {
    menuItems[menu] = client.menu(menu);
  }

  // Generate Prometheus reporter
  metrics.forEach((metric) => {
    // Sanitize exported strings
    if (typeof metric.name !== 'string') {
      return console.log(`Metric missing required 'name' field, skipping ${metric}`);
    }
    if (typeof metric.attribute !== 'string' && typeof metric.type !== 'string') {
      return console.log(`Metric missing required 'attribute' field, skipping ${metric}`);
    }
    const help = attribute.help ? `${attribute.help} ${metric.help ? metric.help : ''}`.trim() : '';
    const name = `mikrotikexporter_${metric.name.trim().replace(/ +/g, '_').toLowerCase()}`;

    // Check if it already exists
    if (!reporters.hasOwnProperty(metric.name)) {
      reporters[metric.name] = new Prometheus.Gauge({ name, help, labelNames });
    }
    /* else {
          // Check if help should be updated
          if (help.length === 0) return;
          // TODO Merge help?
        }*/
  });

  // Sanitize options
  const options = [];
  if (Array.isArray(attribute.options)) {
    attribute.options.forEach((option) => {
      options.push(option);
    })
  }

  return () => {
    switch (type) {
      case 'get':
        menuItems[menu].options(options).get().then(onData(type)).catch(onError);
        break;
      case 'getOne':
        menuItems[menu].options(options).getOne().then(onData(type)).catch(onError);
        break;
    }
  };
}