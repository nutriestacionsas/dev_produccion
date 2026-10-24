#!/bin/bash
unzip -o /tmp/produccion_update.zip -d /home/jmaltap/dev_produccion/
cd /home/jmaltap/dev_produccion/
docker-compose down
docker-compose build --no-cache
docker-compose up -d
