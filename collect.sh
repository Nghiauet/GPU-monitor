#!/usr/bin/env bash
# collect.sh — GPU Monitor collector script
# Usage: ./collect.sh [config.json]
# Writes JSONL output to logs/YYYY-MM-DD/<server>/

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CONFIG_FILE="${1:-config.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${CONFIG_FILE}"

# Make config path absolute
if [[ "${CONFIG_PATH}" != /* ]]; then
  CONFIG_PATH="${SCRIPT_DIR}/${CONFIG_PATH}"
fi

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "ERROR: config file not found: ${CONFIG_PATH}" >&2
  exit 1
fi

TS_UTC() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

TODAY() {
  date -u '+%Y-%m-%d'
}

# Escape a string for use inside a JSON value (double-quoted)
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"   # backslash
  s="${s//\"/\\\"}"   # double-quote
  s="${s//$'\n'/\\n}" # newline
  s="${s//$'\r'/\\r}" # carriage return
  s="${s//$'\t'/\\t}" # tab
  printf '%s' "$s"
}

# Log a structured error to collector.log
LOG_FILE="${SCRIPT_DIR}/collector.log"
log_error() {
  local server="$1"
  local step="$2"
  local error="$3"
  local ts
  ts="$(TS_UTC)"
  printf '{"ts_utc":"%s","server":"%s","step":"%s","error":"%s"}\n' \
    "${ts}" \
    "$(json_escape "${server}")" \
    "$(json_escape "${step}")" \
    "$(json_escape "${error}")" \
    >> "${LOG_FILE}"
}

log_info() {
  local server="$1"
  local step="$2"
  local msg="$3"
  local ts
  ts="$(TS_UTC)"
  printf '{"ts_utc":"%s","server":"%s","step":"%s","msg":"%s"}\n' \
    "${ts}" \
    "$(json_escape "${server}")" \
    "$(json_escape "${step}")" \
    "$(json_escape "${msg}")" \
    >> "${LOG_FILE}"
}

# ---------------------------------------------------------------------------
# Parse config.json with awk (no jq)
# Supports two formats:
#   Format A (spec): servers[].name, .hostname, .ssh_user, .ssh_key_path, .enabled
#   Format B (actual): servers[].name, .host; top-level ssh.user, ssh.key
# ---------------------------------------------------------------------------

parse_config() {
  awk '
  BEGIN {
    server_count = 0
    in_servers = 0
    in_server = 0
    in_ssh = 0
    depth = 0
    server_depth = 0
    ssh_user_global = ""
    ssh_key_global = ""
    log_dir = "./logs"
  }

  # Remove leading/trailing whitespace
  { gsub(/^[ \t]+|[ \t]+$/, "") }

  # Track brace depth
  /{/ {
    depth++
    if (in_servers && !in_server) {
      in_server = 1
      server_depth = depth
      # reset current server fields
      cur_name = ""
      cur_host = ""
      cur_ssh_user = ""
      cur_ssh_key = ""
      cur_enabled = "true"
    }
  }

  /}/ {
    if (in_server && depth == server_depth) {
      # Save server
      servers_name[server_count] = cur_name
      servers_host[server_count] = cur_host
      servers_ssh_user[server_count] = cur_ssh_user
      servers_ssh_key[server_count] = cur_ssh_key
      servers_enabled[server_count] = cur_enabled
      server_count++
      in_server = 0
    }
    if (in_ssh && depth == ssh_depth) {
      in_ssh = 0
    }
    depth--
    if (in_servers && depth < 1) {
      in_servers = 0
    }
  }

  # Detect "servers" array
  /"servers"[ \t]*:/ { in_servers = 1 }

  # Detect top-level "ssh" block
  /"ssh"[ \t]*:/ {
    in_ssh = 1
    ssh_depth = depth + 1
  }

  # Parse log_dir
  /"log_dir"[ \t]*:/ {
    match($0, /"log_dir"[ \t]*:[ \t]*"([^"]*)"/, arr)
    if (arr[1] != "") log_dir = arr[1]
  }

  # Inside server object
  in_server {
    if (match($0, /"name"[ \t]*:[ \t]*"([^"]*)"/, arr))   cur_name = arr[1]
    if (match($0, /"hostname"[ \t]*:[ \t]*"([^"]*)"/, arr)) cur_host = arr[1]
    if (match($0, /"host"[ \t]*:[ \t]*"([^"]*)"/, arr) && cur_host == "") cur_host = arr[1]
    if (match($0, /"ssh_user"[ \t]*:[ \t]*"([^"]*)"/, arr)) cur_ssh_user = arr[1]
    if (match($0, /"ssh_key_path"[ \t]*:[ \t]*"([^"]*)"/, arr)) cur_ssh_key = arr[1]
    if (match($0, /"enabled"[ \t]*:[ \t]*(true|false)/, arr)) cur_enabled = arr[1]
  }

  # Inside top-level ssh block
  in_ssh {
    if (match($0, /"user"[ \t]*:[ \t]*"([^"]*)"/, arr))  ssh_user_global = arr[1]
    if (match($0, /"key"[ \t]*:[ \t]*"([^"]*)"/, arr))   ssh_key_global  = arr[1]
  }

  END {
    print "LOG_DIR=" log_dir
    print "SSH_USER_GLOBAL=" ssh_user_global
    print "SSH_KEY_GLOBAL=" ssh_key_global
    for (i = 0; i < server_count; i++) {
      print "SERVER_NAME[" i "]=" servers_name[i]
      print "SERVER_HOST[" i "]=" servers_host[i]
      print "SERVER_SSH_USER[" i "]=" servers_ssh_user[i]
      print "SERVER_SSH_KEY[" i "]=" servers_ssh_key[i]
      print "SERVER_ENABLED[" i "]=" servers_enabled[i]
    }
    print "SERVER_COUNT=" server_count
  }
  ' "${CONFIG_PATH}"
}

# Load config into variables
eval "$(parse_config)"

# Resolve LOG_DIR relative to script dir if it starts with ./
if [[ "${LOG_DIR}" == ./* ]]; then
  LOG_DIR="${SCRIPT_DIR}/${LOG_DIR#./}"
fi

# Defaults for globals if not set
SSH_USER_GLOBAL="${SSH_USER_GLOBAL:-vagrant}"
SSH_KEY_GLOBAL="${SSH_KEY_GLOBAL:-~/.ssh/id_rsa}"

# ---------------------------------------------------------------------------
# SSH helper using ControlMaster multiplexing
# ---------------------------------------------------------------------------

# Resolve ~ in a path
resolve_path() {
  local p="$1"
  if [[ "${p}" == "~"* ]]; then
    p="${HOME}${p:1}"
  fi
  printf '%s' "$p"
}

# SSH base options
ssh_opts() {
  local key="$1"
  local ctl="$2"
  key="$(resolve_path "${key}")"
  printf -- '-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes'
  printf -- ' -o ControlMaster=auto -o ControlPath=%s -o ControlPersist=60' "${ctl}"
  printf -- ' -i %s' "${key}"
}

# Run a command on a remote server, capturing stdout; returns non-zero on SSH failure
ssh_run() {
  local user="$1"
  local host="$2"
  local key="$3"
  local ctl="$4"
  local cmd="$5"
  local key_resolved
  key_resolved="$(resolve_path "${key}")"
  # shellcheck disable=SC2086
  ssh -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      -o BatchMode=yes \
      -i "${key_resolved}" \
      "${user}@${host}" \
      "${cmd}"
}

# Close a ControlMaster socket
ssh_close() {
  local user="$1"
  local host="$2"
  local key="$3"
  local ctl="$4"
  # ControlMaster disabled for Docker compatibility; nothing to close
  true
}

# ---------------------------------------------------------------------------
# Per-server collection
# ---------------------------------------------------------------------------

collect_server() {
  local svr_name="$1"
  local svr_host="$2"
  local svr_user="$3"
  local svr_key="$4"

  local ts
  ts="$(TS_UTC)"
  local today
  today="$(TODAY)"

  # Output directory
  local out_dir="${LOG_DIR}/${today}/${svr_name}"
  mkdir -p "${out_dir}"

  # ControlMaster socket path (in /tmp)
  local ctl_socket
  ctl_socket="/tmp/gpu_monitor_ssh_${svr_name}_$$"

  # -------------------------------------------------------------------------
  # Step 1: Open SSH connection + get hostname
  # -------------------------------------------------------------------------
  local remote_hostname
  remote_hostname="$(ssh_run "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}" "hostname")" || {
    log_error "${svr_name}" "ssh_connect" "SSH connection failed to ${svr_host}"
    return 1
  }
  remote_hostname="${remote_hostname%%$'\n'*}"  # first line only

  # -------------------------------------------------------------------------
  # Step 2: GPU devices
  # -------------------------------------------------------------------------
  local gpu_raw=""
  gpu_raw="$(ssh_run "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}" \
    "nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,gpu_uuid --format=csv,noheader,nounits 2>&1")" || {
    log_error "${svr_name}" "nvidia_smi_devices" "nvidia-smi device query failed"
    ssh_close "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}"
    return 1
  }

  # Check if nvidia-smi returned an error string (not CSV data)
  if echo "${gpu_raw}" | grep -qi "error\|command not found\|No such file\|failed"; then
    log_error "${svr_name}" "nvidia_smi_devices" "nvidia-smi not available: ${gpu_raw}"
    ssh_close "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}"
    return 1
  fi

  # Build gpu_device.jsonl and a uuid->index map
  local gpu_device_jsonl=""
  # Map: uuid -> index (stored as "UUID INDEX" pairs, one per line)
  local uuid_index_map=""

  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    # Fields: index, name, util.gpu, util.mem, mem.used, mem.total, temp, uuid
    IFS=',' read -r gpu_index gpu_name gpu_util mem_util mem_used mem_total temp gpu_uuid <<< "${line}"
    # Trim whitespace
    gpu_index="$(printf '%s' "${gpu_index}" | tr -d ' ')"
    gpu_name="$(printf '%s' "${gpu_name}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    gpu_util="$(printf '%s' "${gpu_util}" | tr -d ' ')"
    mem_util="$(printf '%s' "${mem_util}" | tr -d ' ')"
    mem_used="$(printf '%s' "${mem_used}" | tr -d ' ')"
    mem_total="$(printf '%s' "${mem_total}" | tr -d ' ')"
    temp="$(printf '%s' "${temp}" | tr -d ' ')"
    gpu_uuid="$(printf '%s' "${gpu_uuid}" | tr -d ' ')"

    # Handle "[Not Supported]" or empty values
    [[ "${gpu_util}" == "[Not"* ]] && gpu_util="0"
    [[ "${mem_util}" == "[Not"* ]] && mem_util="0"
    [[ "${temp}" == "[Not"* ]] && temp="0"
    [[ -z "${gpu_util}" ]] && gpu_util="0"
    [[ -z "${mem_util}" ]] && mem_util="0"
    [[ -z "${temp}" ]] && temp="0"

    uuid_index_map="${uuid_index_map}${gpu_uuid} ${gpu_index}"$'\n'

    local rec
    rec="$(printf '{"ts_utc":"%s","server":"%s","hostname":"%s","gpu_index":%s,"gpu_name":"%s","gpu_util_pct":%s,"mem_util_pct":%s,"mem_used_mb":%s,"mem_total_mb":%s,"temp_c":%s}' \
      "${ts}" \
      "$(json_escape "${svr_name}")" \
      "$(json_escape "${remote_hostname}")" \
      "${gpu_index}" \
      "$(json_escape "${gpu_name}")" \
      "${gpu_util}" \
      "${mem_util}" \
      "${mem_used}" \
      "${mem_total}" \
      "${temp}")"
    gpu_device_jsonl="${gpu_device_jsonl}${rec}"$'\n'
  done <<< "${gpu_raw}"

  printf '%s' "${gpu_device_jsonl}" > "${out_dir}/gpu_device.jsonl"

  # -------------------------------------------------------------------------
  # Step 3: GPU processes (compute apps)
  # -------------------------------------------------------------------------
  local proc_raw=""
  proc_raw="$(ssh_run "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}" \
    "nvidia-smi --query-compute-apps=pid,used_gpu_memory,gpu_uuid --format=csv,noheader,nounits 2>&1")" || true

  # If proc_raw contains error message or is empty, treat as no processes
  if echo "${proc_raw}" | grep -qi "error\|command not found\|No such file"; then
    proc_raw=""
  fi

  # Collect PIDs for ps query
  local pids=()
  # Map: pid -> "used_mem gpu_uuid" pairs
  declare -A pid_gpu_mem=()
  declare -A pid_gpu_uuid=()

  if [[ -n "${proc_raw}" ]]; then
    while IFS= read -r line; do
      [[ -z "${line}" ]] && continue
      IFS=',' read -r pid used_mem uuid <<< "${line}"
      pid="$(printf '%s' "${pid}" | tr -d ' ')"
      used_mem="$(printf '%s' "${used_mem}" | tr -d ' ')"
      uuid="$(printf '%s' "${uuid}" | tr -d ' ')"
      [[ -z "${pid}" || "${pid}" == "pid" ]] && continue
      pids+=("${pid}")
      pid_gpu_mem["${pid}"]="${used_mem}"
      pid_gpu_uuid["${pid}"]="${uuid}"
    done <<< "${proc_raw}"
  fi

  # -------------------------------------------------------------------------
  # Step 4: ps for discovered PIDs
  # -------------------------------------------------------------------------
  # Map: pid -> "user cpu_pct mem_pct elapsed state cmd"
  declare -A pid_ps=()

  if [[ ${#pids[@]} -gt 0 ]]; then
    local pid_list
    pid_list="$(IFS=','; printf '%s' "${pids[*]}")"
    local ps_raw=""
    # ps output: pid, user, %cpu, %mem, etime (elapsed), state, and rest=command
    ps_raw="$(ssh_run "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}" \
      "ps -p ${pid_list} -o pid=,user=,pcpu=,pmem=,etime=,stat=,comm= --no-headers 2>/dev/null || true")" || true

    if [[ -n "${ps_raw}" ]]; then
      while IFS= read -r line; do
        [[ -z "${line}" ]] && continue
        read -r p_pid p_user p_cpu p_mem p_etime p_stat p_comm <<< "${line}"
        # elapsed: convert [[DD-]HH:]MM:SS to seconds
        local elapsed_sec=0
        elapsed_sec="$(etime_to_seconds "${p_etime}")"
        pid_ps["${p_pid}"]="${p_user}|${p_cpu}|${p_mem}|${elapsed_sec}|${p_stat}|${p_comm}"
      done <<< "${ps_raw}"
    fi
  fi

  # -------------------------------------------------------------------------
  # Step 5: Write gpu_process.jsonl
  # -------------------------------------------------------------------------
  local gpu_process_jsonl=""

  for pid in "${pids[@]}"; do
    local used_mem="${pid_gpu_mem[${pid}]:-0}"
    local uuid="${pid_gpu_uuid[${pid}]:-}"

    # Resolve gpu_index from uuid
    local gpu_idx="-1"
    if [[ -n "${uuid}" && -n "${uuid_index_map}" ]]; then
      local found
      found="$(printf '%s' "${uuid_index_map}" | awk -v u="${uuid}" '$1==u{print $2; exit}')"
      [[ -n "${found}" ]] && gpu_idx="${found}"
    fi

    local ps_info="${pid_ps[${pid}]:-unknown|0|0|0|?|unknown}"
    IFS='|' read -r p_user p_cpu p_mem p_elapsed p_stat p_cmd <<< "${ps_info}"

    local rec
    rec="$(printf '{"ts_utc":"%s","server":"%s","hostname":"%s","gpu_index":%s,"gpu_uuid":"%s","pid":%s,"user":"%s","process_name":"%s","cmd":"%s","gpu_mem_mb":%s,"cpu_pct":%s,"mem_pct":%s,"elapsed_sec":%s,"state":"%s"}' \
      "${ts}" \
      "$(json_escape "${svr_name}")" \
      "$(json_escape "${remote_hostname}")" \
      "${gpu_idx}" \
      "$(json_escape "${uuid}")" \
      "${pid}" \
      "$(json_escape "${p_user}")" \
      "$(json_escape "${p_cmd}")" \
      "$(json_escape "${p_cmd}")" \
      "${used_mem}" \
      "${p_cpu}" \
      "${p_mem}" \
      "${p_elapsed}" \
      "$(json_escape "${p_stat}")")"
    gpu_process_jsonl="${gpu_process_jsonl}${rec}"$'\n'
  done

  printf '%s' "${gpu_process_jsonl}" > "${out_dir}/gpu_process.jsonl"

  # -------------------------------------------------------------------------
  # Step 6: user_rollup.jsonl — aggregate per user
  # -------------------------------------------------------------------------
  # Keyed by username
  declare -A user_proc_count=()
  declare -A user_gpu_count=()
  declare -A user_gpu_mem=()
  declare -A user_cpu_sum=()
  declare -A user_cpu_max=()
  declare -A user_gpu_set=()   # track unique gpus per user

  for pid in "${pids[@]}"; do
    local ps_info="${pid_ps[${pid}]:-unknown|0|0|0|?|unknown}"
    IFS='|' read -r p_user p_cpu p_mem p_elapsed p_stat p_cmd <<< "${ps_info}"
    local used_mem="${pid_gpu_mem[${pid}]:-0}"
    local uuid="${pid_gpu_uuid[${pid}]:-}"

    # Resolve index
    local gpu_idx="-1"
    if [[ -n "${uuid}" && -n "${uuid_index_map}" ]]; then
      local found
      found="$(printf '%s' "${uuid_index_map}" | awk -v u="${uuid}" '$1==u{print $2; exit}')"
      [[ -n "${found}" ]] && gpu_idx="${found}"
    fi

    user_proc_count["${p_user}"]=$(( ${user_proc_count["${p_user}"]:-0} + 1 ))
    user_gpu_mem["${p_user}"]="$(awk "BEGIN{print (${user_gpu_mem[${p_user}]:-0} + ${used_mem})}")"
    user_cpu_sum["${p_user}"]="$(awk "BEGIN{print (${user_cpu_sum[${p_user}]:-0} + ${p_cpu})}")"

    # Track if cpu_max should be updated
    local cur_max="${user_cpu_max[${p_user}]:-0}"
    user_cpu_max["${p_user}"]="$(awk "BEGIN{print (${p_cpu} > ${cur_max} ? ${p_cpu} : ${cur_max})}")"

    # Track unique GPUs
    local gpu_key="${p_user}:${gpu_idx}"
    if [[ -z "${user_gpu_set[${gpu_key}]:-}" ]]; then
      user_gpu_set["${gpu_key}"]="1"
      user_gpu_count["${p_user}"]=$(( ${user_gpu_count["${p_user}"]:-0} + 1 ))
    fi
  done

  local user_rollup_jsonl=""
  for uname in "${!user_proc_count[@]}"; do
    local proc_count="${user_proc_count[${uname}]}"
    local gpu_count="${user_gpu_count[${uname}]:-0}"
    local total_mem="${user_gpu_mem[${uname}]:-0}"
    local cpu_sum="${user_cpu_sum[${uname}]:-0}"
    local cpu_max="${user_cpu_max[${uname}]:-0}"
    local avg_cpu=0
    [[ "${proc_count}" -gt 0 ]] && avg_cpu="$(awk "BEGIN{printf \"%.2f\", ${cpu_sum}/${proc_count}}")"

    local rec
    rec="$(printf '{"ts_utc":"%s","server":"%s","hostname":"%s","user":"%s","process_count":%s,"gpu_count":%s,"total_gpu_mem_mb":%s,"avg_cpu_pct":%s,"max_cpu_pct":%s}' \
      "${ts}" \
      "$(json_escape "${svr_name}")" \
      "$(json_escape "${remote_hostname}")" \
      "$(json_escape "${uname}")" \
      "${proc_count}" \
      "${gpu_count}" \
      "${total_mem}" \
      "${avg_cpu}" \
      "${cpu_max}")"
    user_rollup_jsonl="${user_rollup_jsonl}${rec}"$'\n'
  done

  printf '%s' "${user_rollup_jsonl}" > "${out_dir}/user_rollup.jsonl"

  # -------------------------------------------------------------------------
  # Step 7: host_summary.jsonl — top -bn1
  # -------------------------------------------------------------------------
  local top_raw=""
  top_raw="$(ssh_run "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}" \
    "top -bn1 2>&1")" || {
    log_error "${svr_name}" "top" "top command failed"
    ssh_close "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}"
    return 1
  }

  # Also get /proc/meminfo for reliable mem stats
  local meminfo_raw=""
  meminfo_raw="$(ssh_run "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}" \
    "cat /proc/meminfo 2>/dev/null || true")" || true

  # Parse top output
  # Tasks line: "Tasks: 123 total,   1 running, 122 sleeping,   0 stopped,   0 zombie"
  local task_total=0 task_running=0 task_sleeping=0
  local cpu_user=0 cpu_system=0 cpu_idle=0
  local load_1=0 load_5=0 load_15=0
  local mem_total=0 mem_used=0 mem_free=0
  local swap_total=0 swap_used=0

  while IFS= read -r line; do
    # Load average (from top header or uptime line)
    if echo "${line}" | grep -q "load average"; then
      # "load average: 0.00, 0.01, 0.05"
      read -r load_1 load_5 load_15 <<< "$(echo "${line}" | grep -oP 'load average:.*' | sed 's/load average://;s/,/ /g' | awk '{print $1,$2,$3}')"
    fi

    # Tasks line
    if echo "${line}" | grep -qi "^tasks\|^Threads"; then
      task_total="$(echo "${line}" | grep -oP '\d+ total' | grep -oP '\d+'  || echo 0)"
      task_running="$(echo "${line}" | grep -oP '\d+ running' | grep -oP '\d+' || echo 0)"
      task_sleeping="$(echo "${line}" | grep -oP '\d+ sleeping' | grep -oP '\d+' || echo 0)"
    fi

    # CPU line: "%Cpu(s):  x.x us,  x.x sy, ..."
    if echo "${line}" | grep -qi "^%cpu\|cpu(s)"; then
      cpu_user="$(echo "${line}" | grep -oP '[\d.]+(?= us)' || echo 0)"
      cpu_system="$(echo "${line}" | grep -oP '[\d.]+(?= sy)' || echo 0)"
      cpu_idle="$(echo "${line}" | grep -oP '[\d.]+(?= id)' || echo 0)"
    fi

    # MiB Mem line: "MiB Mem :  15987.9 total,    234.5 free,   8765.1 used, ..."
    if echo "${line}" | grep -qi "mib mem\|kib mem"; then
      local unit=1
      echo "${line}" | grep -qi "kib" && unit=1024
      local mt mf mu
      mt="$(echo "${line}" | grep -oP '[\d.]+(?= total)' || echo 0)"
      mf="$(echo "${line}" | grep -oP '[\d.]+(?= free)' || echo 0)"
      mu="$(echo "${line}" | grep -oP '[\d.]+(?= used)' || echo 0)"
      # convert from MiB to MiB (already MiB) or KiB to MiB
      if [[ "${unit}" -eq 1024 ]]; then
        mem_total="$(awk "BEGIN{printf \"%.1f\", ${mt}/1024}")"
        mem_free="$(awk "BEGIN{printf \"%.1f\", ${mf}/1024}")"
        mem_used="$(awk "BEGIN{printf \"%.1f\", ${mu}/1024}")"
      else
        mem_total="${mt}"
        mem_free="${mf}"
        mem_used="${mu}"
      fi
    fi

    # Swap line
    if echo "${line}" | grep -qi "mib swap\|kib swap"; then
      local unit=1
      echo "${line}" | grep -qi "kib" && unit=1024
      local st sf su
      st="$(echo "${line}" | grep -oP '[\d.]+(?= total)' || echo 0)"
      su="$(echo "${line}" | grep -oP '[\d.]+(?= used)' || echo 0)"
      if [[ "${unit}" -eq 1024 ]]; then
        swap_total="$(awk "BEGIN{printf \"%.1f\", ${st}/1024}")"
        swap_used="$(awk "BEGIN{printf \"%.1f\", ${su}/1024}")"
      else
        swap_total="${st}"
        swap_used="${su}"
      fi
    fi
  done <<< "${top_raw}"

  # Fallback to /proc/meminfo for more reliable memory values
  if [[ -n "${meminfo_raw}" ]]; then
    local mi_total mi_free mi_avail mi_swap_total mi_swap_free
    mi_total="$(echo "${meminfo_raw}" | awk '/^MemTotal:/{print $2}')"
    mi_free="$(echo "${meminfo_raw}"  | awk '/^MemFree:/{print $2}')"
    mi_swap_total="$(echo "${meminfo_raw}" | awk '/^SwapTotal:/{print $2}')"
    mi_swap_free="$(echo "${meminfo_raw}"  | awk '/^SwapFree:/{print $2}')"

    if [[ -n "${mi_total}" && "${mi_total}" -gt 0 ]]; then
      mem_total="$(awk "BEGIN{printf \"%.1f\", ${mi_total}/1024}")"
      mem_free="$(awk "BEGIN{printf \"%.1f\", ${mi_free:-0}/1024}")"
      mem_used="$(awk "BEGIN{printf \"%.1f\", (${mi_total} - ${mi_free:-0})/1024}")"
    fi
    if [[ -n "${mi_swap_total}" ]]; then
      swap_total="$(awk "BEGIN{printf \"%.1f\", ${mi_swap_total}/1024}")"
      swap_used="$(awk "BEGIN{printf \"%.1f\", (${mi_swap_total} - ${mi_swap_free:-0})/1024}")"
    fi
  fi

  local host_summary_rec
  host_summary_rec="$(printf '{"ts_utc":"%s","server":"%s","hostname":"%s","load_1":%s,"load_5":%s,"load_15":%s,"cpu_user_pct":%s,"cpu_system_pct":%s,"cpu_idle_pct":%s,"mem_total_mb":%s,"mem_used_mb":%s,"mem_free_mb":%s,"swap_total_mb":%s,"swap_used_mb":%s,"task_total":%s,"task_running":%s,"task_sleeping":%s}' \
    "${ts}" \
    "$(json_escape "${svr_name}")" \
    "$(json_escape "${remote_hostname}")" \
    "${load_1:-0}" \
    "${load_5:-0}" \
    "${load_15:-0}" \
    "${cpu_user:-0}" \
    "${cpu_system:-0}" \
    "${cpu_idle:-0}" \
    "${mem_total:-0}" \
    "${mem_used:-0}" \
    "${mem_free:-0}" \
    "${swap_total:-0}" \
    "${swap_used:-0}" \
    "${task_total:-0}" \
    "${task_running:-0}" \
    "${task_sleeping:-0}")"

  printf '%s\n' "${host_summary_rec}" > "${out_dir}/host_summary.jsonl"

  # -------------------------------------------------------------------------
  # Cleanup SSH connection
  # -------------------------------------------------------------------------
  ssh_close "${svr_user}" "${svr_host}" "${svr_key}" "${ctl_socket}"

  log_info "${svr_name}" "collect" "collection complete → ${out_dir}"
  return 0
}

# ---------------------------------------------------------------------------
# Utility: convert ps etime format to seconds
# Format: [[DD-]HH:]MM:SS
# ---------------------------------------------------------------------------
etime_to_seconds() {
  local etime="$1"
  etime="${etime// /}"  # trim whitespace
  local days=0 hours=0 mins=0 secs=0

  if echo "${etime}" | grep -q '-'; then
    days="${etime%%-*}"
    etime="${etime#*-}"
  fi
  IFS=':' read -ra parts <<< "${etime}"
  local n="${#parts[@]}"
  if [[ "${n}" -eq 3 ]]; then
    hours="${parts[0]}"
    mins="${parts[1]}"
    secs="${parts[2]}"
  elif [[ "${n}" -eq 2 ]]; then
    mins="${parts[0]}"
    secs="${parts[1]}"
  elif [[ "${n}" -eq 1 ]]; then
    secs="${parts[0]}"
  fi
  # Strip leading zeros to prevent bash from treating values as octal
  days=$((10#$days)) hours=$((10#$hours)) mins=$((10#$mins)) secs=$((10#$secs))
  printf '%d' $(( days*86400 + hours*3600 + mins*60 + secs ))
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
main() {
  log_info "collector" "start" "collect.sh starting, config=${CONFIG_PATH}"

  local any_failure=0

  for (( i=0; i<SERVER_COUNT; i++ )); do
    # Bash array-style variable names from eval'd config
    local svr_name svr_host svr_ssh_user svr_ssh_key svr_enabled

    # Use indirect references via eval (safe — values come from our own awk parser)
    eval "svr_name=\"\${SERVER_NAME[$i]}\""
    eval "svr_host=\"\${SERVER_HOST[$i]}\""
    eval "svr_ssh_user=\"\${SERVER_SSH_USER[$i]}\""
    eval "svr_ssh_key=\"\${SERVER_SSH_KEY[$i]}\""
    eval "svr_enabled=\"\${SERVER_ENABLED[$i]:-true}\""

    # Fall back to global SSH credentials if per-server not set
    [[ -z "${svr_ssh_user}" ]] && svr_ssh_user="${SSH_USER_GLOBAL}"
    [[ -z "${svr_ssh_key}"  ]] && svr_ssh_key="${SSH_KEY_GLOBAL}"

    # Default host to name if not set
    [[ -z "${svr_host}" ]] && svr_host="${svr_name}"

    if [[ "${svr_enabled}" == "false" ]]; then
      log_info "${svr_name}" "skip" "server disabled in config"
      continue
    fi

    if [[ -z "${svr_name}" ]]; then
      continue
    fi

    collect_server "${svr_name}" "${svr_host}" "${svr_ssh_user}" "${svr_ssh_key}" || {
      log_error "${svr_name}" "collect" "collection failed for ${svr_name}"
      any_failure=1
    }

    # Unset per-iteration associative arrays to avoid bleed-over
    unset pid_gpu_mem pid_gpu_uuid pid_ps
    unset user_proc_count user_gpu_count user_gpu_mem user_cpu_sum user_cpu_max user_gpu_set
  done

  if [[ "${any_failure}" -eq 1 ]]; then
    log_info "collector" "done" "completed with partial failures"
  else
    log_info "collector" "done" "all servers collected successfully"
  fi

  # Always exit 0 — partial failure tolerant
  exit 0
}

main
