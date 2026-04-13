#!/bin/bash
# Copy mounted SSH files to a working directory with correct ownership for root
set -e

if [ -d /root/.ssh-mount ]; then
  mkdir -p /root/.ssh
  cp -a /root/.ssh-mount/* /root/.ssh/ 2>/dev/null || true
  cp -a /root/.ssh-mount/.* /root/.ssh/ 2>/dev/null || true
  chown -R root:root /root/.ssh
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/config 2>/dev/null || true
  chmod 600 /root/.ssh/id_* 2>/dev/null || true

  # Fix IdentityFile paths: rewrite any host-side ~/.ssh/ path to /root/.ssh/ inside container
  if [ -f /root/.ssh/config ]; then
    sed -i 's|IdentityFile .*/\.ssh/|IdentityFile /root/.ssh/|g' /root/.ssh/config
  fi
fi

exec "$@"
