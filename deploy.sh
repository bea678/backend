#!/bin/bash

# Configuración de variables
IMAGE_NAME="app-bearbitrage"
CONTAINER_NAME="bearbitrage-container"
PORT="3000:3000"
ENV_FILE=".env"

echo "🚀 Iniciando despliegue de $IMAGE_NAME..."

# 1. Detener y eliminar el contenedor existente si existe
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "Stopping existing container: $CONTAINER_NAME..."
    docker stop $CONTAINER_NAME
    echo "Removing existing container: $CONTAINER_NAME..."
    docker rm $CONTAINER_NAME
fi

# 2. Construir la nueva imagen
echo "🔨 Building image $IMAGE_NAME..."
docker build -t $IMAGE_NAME .

# 3. Ejecutar el nuevo contenedor
echo "🏃 Running new container..."
docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT \
    --env-file $ENV_FILE \
    --restart always \
    $IMAGE_NAME

# 4. Limpieza (Opcional: borra imágenes antiguas sin nombre para ahorrar espacio)
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Despliegue completado con éxito en el puerto $PORT"
docker ps -f name=$CONTAINER_NAME
