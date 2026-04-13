export DOCKER_CONFIG=/media/Docker/AppData/forge/docker-config
mkdir -p "$DOCKER_CONFIG"

cd /media/GitHub/Forge
docker compose -f docker-compose.nas.yml build --no-cache
docker compose -f docker-compose.nas.yml up -d