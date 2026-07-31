#!/bin/bash
set -euo pipefail # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting

# Research container: network egress is INTENTIONALLY UNRESTRICTED.
#
# The original allowlist/denylist firewall (ipset + per-domain curation) has
# been removed for this project. Canton/Daml work needs to reach a broad and
# shifting set of hosts -- the dpm installer (get.digitalasset.com), JDK/Maven
# mirrors, GitHub, crates.io, npm, and arbitrary chain RPC endpoints -- which
# is impractical to enumerate. Egress is therefore open to any IP.
#
# To restore a restrictive firewall, reinstate the allowlist version of this
# script together with an allowed-domains.txt and re-add the COPY line in the
# Dockerfile.

echo "init-firewall: research mode -- allowing all network traffic"

# Flush any pre-existing rules and drop the old ipset if present.
iptables -F 2>/dev/null || true
iptables -X 2>/dev/null || true
iptables -t nat -F 2>/dev/null || true
iptables -t nat -X 2>/dev/null || true
iptables -t mangle -F 2>/dev/null || true
iptables -t mangle -X 2>/dev/null || true
ipset destroy allowed-domains 2>/dev/null || true

# Permissive default policies: all inbound, forwarded, and outbound traffic.
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

echo "init-firewall: all traffic permitted"
