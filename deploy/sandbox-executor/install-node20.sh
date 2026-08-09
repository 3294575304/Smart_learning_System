#!/usr/bin/env bash
set -euo pipefail

install_root="/opt/zhixue-node20-install"
distribution_base="${NODE_DIST_BASE_URL:-https://nodejs.org/dist}"
release_url="${distribution_base%/}/latest-v20.x"
sudo mkdir -p "${install_root}"
sudo chown "$(id -u):$(id -g)" "${install_root}"
cd "${install_root}"

curl -fsSL "${release_url}/SHASUMS256.txt" -o SHASUMS256.txt
archive="$(awk '$2 ~ /^node-v20\..*-linux-x64\.tar\.xz$/ { print $2 }' SHASUMS256.txt)"
if [[ -z "${archive}" ]] || [[ "${archive}" == *$'\n'* ]]; then
  echo "Unable to select one Node.js 20 x64 archive" >&2
  exit 1
fi

curl -fsSL "${release_url}/${archive}" -o "${archive}"
grep " ${archive}$" SHASUMS256.txt | sha256sum -c -
directory="${archive%.tar.xz}"
sudo tar -xJf "${archive}" -C /usr/local/lib
sudo ln -sfn "/usr/local/lib/${directory}" /usr/local/lib/zhixue-node20
sudo ln -sfn /usr/local/lib/zhixue-node20/bin/node /usr/local/bin/node
/usr/local/bin/node --version
