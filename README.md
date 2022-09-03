# TadiranKit
Simple Homekit connector for Tadiran ACs, without Homebridge

## Setting up AC WiFi
With the AC unit off, press MODE+WIFI until it beeps to reset the WiFi settings.


Connect to the newly broadcast WiFi network and send it your WiFi credentials (2.4GHz only):
```bash
echo -n "{\"psw\": \"SSID\",\"ssid\": \"password\",\"t\": \"wlan\"}" | nc -u 192.168.1.1 7000
```

## Scanning for devices
The AC units are listening on port 7000, either find their IP in your router or scan for them using [https://github.com/cmroche/greeclimate](https://github.com/cmroche/greeclimate)
```bash
git clone https://github.com/cmroche/greeclimate
cd greeclimate
python3 gree.py --discovery

greeclimate.discovery - INFO - Found gree device Device: xxxxxxxxxxxx @ 192.168.1.100:7000 (mac: xxxxxxxxxxxx)
```

## Running
You can run the server directly, the only thing you have to explictly set is the target ip:
```bash
TARGET_IP=192.168.1.100 node src/main.js
```

## Dockerizing
For convenience, a Dockerfile is provided. 
Build by running:
```bash
sudo docker build -t tadirankit .
```

And then run:
```bash
sudo docker run -d  -t --restart always -e TARGET_IP=192.168.1.100 tadirankit
```
