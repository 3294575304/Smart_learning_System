#!/usr/bin/env bash
set -euo pipefail

service_user="sandboxexec"
service_root="/opt/zhixue-sandbox-executor"
environment_file="/etc/zhixue-sandbox-executor.env"

if ! id "${service_user}" >/dev/null 2>&1; then
  sudo useradd \
    --system \
    --home-dir /var/lib/zhixue-sandbox-executor \
    --shell /usr/sbin/nologin \
    "${service_user}"
fi
sudo usermod --append --groups docker "${service_user}"
sudo install -d -m 0755 -o root -g root "${service_root}"
sudo install -m 0644 -o root -g root /tmp/zhixue-sandbox-build/*.js "${service_root}/"
sudo install -m 0644 -o root -g root /tmp/zhixue-sandbox-executor.service /etc/systemd/system/zhixue-sandbox-executor.service

if [[ ! -f "${environment_file}" ]]; then
  api_key="$(openssl rand -hex 32)"
  environment_content="$(cat <<EOF
SANDBOX_EXECUTOR_API_KEY=${api_key}
SANDBOX_EXECUTOR_BIND_HOST=127.0.0.1
SANDBOX_EXECUTOR_PORT=8788
SANDBOX_EXECUTOR_MAX_CONCURRENCY=1
SANDBOX_DOCKER_BINARY=/usr/bin/docker
SANDBOX_DOCKER_RUNTIME=runsc
SANDBOX_RUNTIME_IMAGE=zhixue-python-sandbox:3.10-v1
SANDBOX_EXECUTOR_WORK_ROOT=/var/lib/zhixue-sandbox-executor/work
SANDBOX_EXECUTOR_VERSION=zhixue-sandbox-executor-0.1.0+20260808
EOF
)"
  printf '%s\n' "${environment_content}" | sudo install -m 0600 -o root -g root /dev/stdin "${environment_file}"
fi

sudo systemctl daemon-reload
sudo systemctl enable --now zhixue-sandbox-executor.service
sudo systemctl restart zhixue-sandbox-executor.service
sudo systemctl --no-pager --full status zhixue-sandbox-executor.service
status=""
for _ in {1..30}; do
  status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/v1/executions || true)"
  if [[ "${status}" == "401" ]]; then
    break
  fi
  sleep 0.2
done
if [[ "${status}" != "401" ]]; then
  echo "Executor authentication smoke test returned ${status}" >&2
  exit 1
fi
echo "EXECUTOR_AUTH_SMOKE=401"
