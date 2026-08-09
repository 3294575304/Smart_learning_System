#!/usr/bin/env bash
set -euo pipefail

image="zhixue-python-sandbox:3.10-v1"
rootfs="/opt/zhixue-python-rootfs-3.10-v1"
mirror="${UBUNTU_MIRROR:-http://mirrors.cloud.aliyuncs.com/ubuntu}"

sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y debootstrap
if [[ "${rootfs}" != /opt/zhixue-python-rootfs-* ]]; then
  echo "Refusing to rebuild an unexpected rootfs path" >&2
  exit 1
fi
sudo rm -rf -- "${rootfs}"
sudo mkdir -p "${rootfs}"
sudo debootstrap \
  --variant=minbase \
  --include=python3-minimal,ca-certificates \
  jammy \
  "${rootfs}" \
  "${mirror}"
sudo mkdir -p "${rootfs}/workspace" "${rootfs}/tmp"
sudo chmod 1777 "${rootfs}/tmp"
sudo rm -rf "${rootfs}/var/lib/apt/lists"/* "${rootfs}/var/cache/apt/archives"/*.deb

sudo tar --numeric-owner --xattrs --acls -C "${rootfs}" -cf - . | \
  sudo docker import \
    --change 'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONHASHSEED=0' \
    --change 'WORKDIR /workspace' \
    --change 'USER 65534:65534' \
    --change 'ENTRYPOINT ["python3"]' \
    - \
    "${image}"

sudo docker run \
  --rm \
  --runtime=runsc \
  --network=none \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --pids-limit=34 \
  --ulimit nproc=2:2 \
  --memory=64m \
  --memory-swap=64m \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16777216 \
  "${image}" \
  --version
sudo docker image inspect "${image}" --format '{{.Id}}'
