import Prometheus from 'prom-client';

export default (attribute, client, menuItems, reporters) => {
  const { command, labels, menu, metrics, where } = attribute;

  const exit = (err) => {
    console.log(err);
    process.exit(1);
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

  const onData = (err, data) => {
    if (err) {
      exit(err);
    }
    // Data for stream received, check for wanted metrics
    metrics.forEach((metric) => {
      if (typeof metric.name !== 'string' || typeof metric.attribute !== 'string') return;
      if (data[0].hasOwnProperty(metric.attribute)) {
        reporters[metric.name].set(labelData, data[0][metric.attribute]);
      }
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
      console.log(`Metric missing required 'name' field, skipping ${metric}`);
    }
    if (typeof metric.attribute !== 'string') {
      console.log(`Metric missing required 'attribute' field, skipping ${metric}`);
    }
    const help = attribute.help ? `${attribute.help} ${metric.help ? metric.help : ''}`.trim() : '';
    const name = `mikrotikexporter_${metric.name.trim().replace(/ +/g, '_').toLowerCase()}`;

    // Check if it already exists
    if (!reporters.hasOwnProperty(metric.name)) {
      reporters[metric.name] = new Prometheus.Gauge({ name, help, labelNames });
    }/* else {
      // Check if help should be updated
      if (help.length === 0) return;
      // TODO Merge help?
    }*/
  });

  // Generate stream
  if (where && where.length >= 2) {
    return menuItems[menu].where(where[0], where[1]).stream(command, onData);
  } else {
    return menuItems[menu].stream(command, onData);
  }
}