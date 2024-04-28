# Meshtastic signal level probing tool

A tool reporting signal levels of a probe packet as received by the target node. Only one packet is transmitted on the air. Any other communication goes via an mqtt broker.

It's advised to use a secure private broker to restrict publishing to the `mqtt` channel by a third party.

## Example output

On a successful probe the fields are:
1. the moment of the probe initiation (publishing to the `mqtt` channel),
2. delay in milliseconds between probe tx and rx reports from the broker,
3. Meshtastic packet id of the probe,
4. RSSI level,
5. SNR level.

```
2024-04-29T13:07:33.712Z timeout (no rx report)
2024-04-29T13:08:33.716Z   1379 2abb1de1  -91  -9.75
2024-04-29T13:09:33.718Z    919 2abb1de2  -88     -9
2024-04-29T13:10:33.720Z    916 2abb1de3  -89     -8
2024-04-29T13:11:33.735Z   1321 2abb1de4  -89   -7.5
2024-04-29T13:12:33.738Z timeout (no rx report)
2024-04-29T13:13:33.740Z   1723 2abb1de6  -92  -10.5
2024-04-29T13:14:33.741Z   3679 2abb1de7  -89   -7.5
```

## Running

- Configure the nodes:
    * Both nodes should uplink their primary channel with json output enabled to allow the tool to receive reports from the nodes.
    * The source node should have a downlinked `mqtt` channel to allow the tool to initiate a probe.
- Configure `ping.yaml` using the template.
- Run `npm i` once and then `node ping.js` to start a probing loop.
