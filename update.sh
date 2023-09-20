#!/bin/bash

ps -ef | grep 'java -jar terminal-proxy' | awk '{print $2}' | xargs kill
rm -rf 'nohup.out'
nohup java -jar terminal-proxy-0.0.1-SNAPSHOT.jar &
tail -f -n500 'nohup.out'