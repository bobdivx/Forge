# Deploiement Forge sur ZimaOS (via SSH)

Cette documentation decrit la methode fiable pour lancer Forge depuis le dossier local du projet:

- Chemin projet: `/media/GitHub/Forge`
- Compose cible: `docker-compose.nas.yml`

## 1) Prerequis

- Docker et Docker Compose installes sur ZimaOS
- Acces SSH a la machine
- Le projet Forge present dans `/media/GitHub/Forge`

## 2) Se connecter et se placer dans le dossier

```bash
ssh bobdivx@<IP_ZIMACUBE>
cd /media/GitHub/Forge
```

## 3) Lancer Forge

Sur cet environnement ZimaOS, Buildx peut echouer a cause des permissions.  
Utiliser ce lancement (valide):

```bash
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose -f docker-compose.nas.yml up -d --build
```

## 4) Verifier le service

```bash
docker compose -f docker-compose.nas.yml ps
docker compose -f docker-compose.nas.yml logs -f forge
```

Si tout est OK, le conteneur `forge` est en `Up`.

## 5) URL d'acces

Le service ecoute en interne sur `4321`.  
Le port externe est `FORGE_PORT` (defaut actuel dans ce compose: `4331`).

Exemple:

`http://<IP_ZIMACUBE>:4331`

## 5bis) Utiliser l'image Docker Hub

Les compose NAS utilisent maintenant:

`FORGE_IMAGE` (defaut: `bobdivx/forge:latest`)

Exemple pour forcer un tag:

```bash
FORGE_IMAGE=bobdivx/forge:sha-abcdef123456 docker compose -f docker-compose.nas.yml up -d
```

## 6) Probleme connu: droits Docker

Erreur typique:

`permission denied while trying to connect to the Docker daemon socket`

Correctif:

```bash
sudo usermod -aG docker bobdivx
newgrp docker
docker ps
```

Puis relancer la commande du chapitre 3.

## 7) Probleme connu: Buildx / read-only filesystem

Erreur typique:

- `mkdir /DATA/.docker/buildx: permission denied`
- `mkdir /home/...: read-only file system`

Contournement recommande:

```bash
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose -f docker-compose.nas.yml up -d --build
```

## 8) Variante stack complete

Pour lancer Forge + Postgres + Redis:

```bash
docker compose -f docker-compose.nas.full.yml up -d --build
```

---

## Commandes utiles

```bash
# Arreter
docker compose -f docker-compose.nas.yml down

# Rebuild force
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose -f docker-compose.nas.yml up -d --build --force-recreate

# Etat global des conteneurs
docker ps
```
