#!/usr/bin/env bash
set -euo pipefail

service_user="zhixue-worker"
install_root="/opt/zhixue-programming-judge-worker"
environment_target="/etc/zhixue-programming-judge-worker.env"
build_root="${1:-/tmp/zhixue-programming-judge-worker-build}"
environment_source="${2:-/tmp/zhixue-programming-judge-worker.env}"
service_source="${3:-/tmp/zhixue-programming-judge-worker.service}"

if [[ ! -d "${build_root}" ]] || [[ ! -f "${build_root}/main.js" ]]; then
  echo "Missing compiled worker files in ${build_root}" >&2
  exit 1
fi
if [[ ! -f "${environment_source}" ]]; then
  echo "Missing worker environment file ${environment_source}" >&2
  exit 1
fi
if [[ ! -f "${service_source}" ]]; then
  echo "Missing systemd unit ${service_source}" >&2
  exit 1
fi

node - "${environment_source}" <<'NODE'
const { readFileSync } = require("node:fs");

const values = new Map();
for (const rawLine of readFileSync(process.argv[2], "utf8").split(/\r?\n/u)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) throw new Error("Invalid worker environment entry");
  const name = line.slice(0, separator).trim();
  let value = line.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  values.set(name, value);
}

for (const name of ["BACKGROUND_JOB_WORKER_SECRET", "SANDBOX_EXECUTOR_API_KEY"]) {
  if ((values.get(name) ?? "").length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
}
for (const name of ["APPLICATION_INTERNAL_URL", "SANDBOX_EXECUTOR_URL"]) {
  const value = values.get(name);
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
}
NODE

if ! id -u "${service_user}" >/dev/null 2>&1; then
  sudo useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin "${service_user}"
fi

sudo install -d -m 0755 -o root -g root "${install_root}"
while IFS= read -r -d '' artifact; do
  sudo install -m 0644 -o root -g root "${artifact}" "${install_root}/$(basename "${artifact}")"
done < <(find "${build_root}" -maxdepth 1 -type f -name '*.js' -print0)
sudo install -m 0600 -o root -g root "${environment_source}" "${environment_target}"
sudo install -m 0644 -o root -g root "${service_source}" /etc/systemd/system/zhixue-programming-judge-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now zhixue-programming-judge-worker.service
sudo systemctl restart zhixue-programming-judge-worker.service
sudo systemctl is-active --quiet zhixue-programming-judge-worker.service

echo "PROGRAMMING_JUDGE_WORKER_ACTIVE=1"
