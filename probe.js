import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import MQTT from 'mqtt';

function formatHex(v) {
  return v.toString(16).padStart(8, '0');
}

function formatNodeId(v) {
  return '!' + formatHex(v);
}

function parseNodeId(v) {
  if (v === undefined || !v.startsWith('!')) {
    return undefined;
  }
  const id = parseInt(v.slice(1), 16);
  if (typeof id !== 'number') {
    return undefined;
  }
  return id;
}

function random32() {
  return Math.floor(Math.random() * (2 ** 32 - 1));
}

const ProbeStatus = {
  Success: 0,
  Timeout: 1,
  NotTransmitted: 2,
};

class ProbeEngine {
  constructor(client, config) {
    const uplinkPrefix = `${config.topic}/2/json/${config.uplinkChannel}/`;
    client.subscribe(`${uplinkPrefix}+`);

    this.client = client;
    this.config = config;
    this.uplinkPrefixLength = uplinkPrefix.length;
  }

  async probe() {
    const id = random32();
    const extraLoad = '.'.repeat(this.config.extraLoad);
    let onMessage;

    return new Promise((resolve, _reject) => {
      // ID of the on-air packet from source to target.
      let packetId;
      // The time the source reports its transmission.
      let txTime;

      // Start a timeout timer.
      const timer = setTimeout(() => {
        if (packetId === undefined) {
          resolve({ status: ProbeStatus.NotTransmitted });
        } else {
          resolve({ status: ProbeStatus.Timeout });
        }
      }, this.config.timeout);

      onMessage = (topic, message) => {
        let json;
        try {
          json = JSON.parse(message.toString());
        } catch {
          // Skip if parsing failed.
          return;
        }

        if (json.from != this.config.from ||
            json.to != 0 ||
            json.payload === null ||
            json.payload.text != `${formatHex(id)}${extraLoad}`) {
          // Skip if the message is not the probe.
          return;
        }

        const target = topic.slice(this.uplinkPrefixLength);
        if (packetId === undefined) {
          // First, register a source transmission report.
          if (target == formatNodeId(this.config.from)) {
            packetId = json.id;
            txTime = Date.now();
          }
        } else if (json.id == packetId) {
          // Second, register a target one.
          if (target == formatNodeId(this.config.to)) {
            clearTimeout(timer);
            resolve({
              status: ProbeStatus.Success,
              res: {
                delay: Date.now() - txTime,
                packetId: packetId,
                rssi: json.rssi,
                snr: json.snr,
              }
            });
          }
        }
      };

      // Start listening for packets.
      this.client.on('message', onMessage);

      // Initiate the measuring by making the source transmit a probe packet:
      // - set destination to zero so that the target won't push it to the phone,
      // - set hop limit to zero to deny transmission by any other node except the source.
      const probe = `{
        "from": ${this.config.from},
        "to": 0,
        "hopLimit": 0,
        "payload": "${formatHex(id)}${extraLoad}",
        "type": "sendtext"
      }`;
      this.client.publish(`${this.config.topic}/2/json/mqtt/` +
        `${formatNodeId(this.config.from)}`, probe);
    }).finally(() => {
      // Stop listening for packets.
      this.client.removeListener('message', onMessage);
    });
  }

  async loop() {
    let go = true;
    while (go) {
      const startTime = new Date().toISOString();

      const probePromise = this.probe().then((value) => {
        if (value.status === ProbeStatus.Success) {
          const delay = value.res.delay.toString().padStart(6, ' ');
          const packetId = formatHex(value.res.packetId);
          const rssi = value.res.rssi.toString().padStart(4, ' ');
          const snr = value.res.snr.toString().padStart(6, ' ');
          console.log(`${startTime} ${delay} ${packetId} ${rssi} ${snr}`);
        } else if (value.status === ProbeStatus.Timeout) {
          console.log(`${startTime} timeout (no rx report)`);
        } else if (value.status === ProbeStatus.NotTransmitted) {
          console.log(`${startTime} failure (no tx report)`);
        } else {
          console.log(`${startTime} failure (internal error)`);
        }
      });

      const intervalPromise = new Promise((resolve, _reject) => {
        setTimeout(resolve, this.config.interval);
      });

      // Run interval timer and probe in parallel.
      await Promise.all([probePromise, intervalPromise]).catch((error) => {
        console.error(`${startTime} ${error}`);
        go = false;
      });
    }  
  }
}

class ProbeConfig {
  constructor(filename) {
    let configData = readFileSync(filename, 'utf8');
    let config = YAML.parse(configData);

    this.url = config.url;
    this.topic = config.topic;
    this.uplinkChannel = config.uplinkChannel;
    this.from = parseNodeId(config.from);
    this.to = parseNodeId(config.to);
    this.extraLoad = parseInt(config.extraLoad);
    this.timeout = parseInt(config.timeout);
    this.interval = parseInt(config.interval);
    this.sanitize();
  }
  sanitize() {
    // TODO
  }
}

if (process.argv.length > 3 || (process.argv.length == 3 && process.argv[2] == '-h')) {
  console.log(`Usage: node probe.js [<config-yaml>]`);
  process.exit(0);
}

let configFilename = 'probe.yaml';
if (process.argv.length == 3) {
  configFilename = process.argv[2];
}

let config;
try {
  config = new ProbeConfig(configFilename);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

await MQTT.connectAsync(config.url, { connectTimeout: 5000 })
  .then((client) => {
    return new ProbeEngine(client, config).loop();
  })
  .catch((reason) => {
    console.error(reason.message);
    process.exit(2);
  });
