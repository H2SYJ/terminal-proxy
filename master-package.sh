#!/bin/bash

mvn clean package

scp target/terminal-proxy-0.0.1-SNAPSHOT.jar root@192.168.3.33:/root/terminal-proxy