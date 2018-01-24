import defConfig from './config/default';
import fs from 'fs';

export default (filename, requiredFields) => {
  const exit = (err) => {
    console.log(err);
    process.exit(1);
  };

  if (fs.existsSync(filename)) {
    const fileContents = fs.readFileSync(filename, 'utf8');
    if (fileContents) {
      try {
        const config = JSON.parse(fileContents);

        requiredFields.forEach((field) => {
          if (!config.hasOwnProperty(field))
            exit(`Missing required field '${field}' from ${filename}`);
        });
        return config;
      } catch (err) {
        exit(`Unable to parse configuration file, please check JSON validity. Error: ${err}`);
      }
    }
  } else {
    console.log('Unable to find configuration file');
    fs.writeFile(filename, `${JSON.stringify(defConfig, null, 2)}\n`, 'utf8', (err) => {
      if (err) {
        exit(`Error writing to ${filename}: ${err}`);
      }
      exit(`Copied default config to ${filename}`);
    });
  }
}