# TadiranKit

Simple Homekit connector for Tadiran ACs, without Homebridge

## Setting up AC WiFi

With the AC unit off, press MODE+WIFI until it beeps to reset the WiFi settings.

Connect to the newly broadcast WiFi network and send it your WiFi credentials (2.4GHz only):

```bash
echo -n "{\"psw\": \"[PASSWORD]\",\"ssid\": \"[SSID]\",\"t\": \"wlan\"}" | nc -u 192.168.1.1 7000
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

You can run the server directly, the only thing you have to explictly set is the target ip and listen port:

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
sudo docker run -d  -t --restart always --net=host -e TARGET_IP=192.168.1.100 -e tadirankit
sudo docker logs [container id] # To get QR code
```

# Hardening
In my router - added a rule to drop all outgoing connections on the internet interface for the MAC addresses of the two devices, as well as gave them static IPs.
Since they are on WiFi, it would be better to block it at the access point level.

Once you do this, you will see the WiFi interface on the AC becoming somewhat unavailable on the network - perhaps it's spinning on timeouts to the management server, which is now blocked.

To resolve this, I installed https://github.com/emtek-at/GreeAC-DummyServer, also in a Docker container.
I had to change the target image:
```
FROM mcr.microsoft.com/dotnet/sdk:6.0
```

I also added the following hostnames to resolve to the IP of my Docker host, which is running the DummyServer
```
dis.gree.com
gree.home.com
info-acq.gree.com
```

These are not strictly necessary, but make the following step redundant (I think?), which is to use https://github.com/emtek-at/GreeAC-ConfigTool to change the remote host on the device.


