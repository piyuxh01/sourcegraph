#!/usr/bin/env bash
# shellcheck disable=SC2064,SC2207

# create a file to hold the output of `wait`
waitout=$(mktemp || mktemp -t waitout_XXXXXXXX)

# create a file to hold the resource usage of the child process
stats=$(mktemp || mktemp -t resource_XXXXXXXX)

# make sure to cleanup on exit
#
trap "[ -f \"${waitout}\" ] && rm -f \"${waitout}\";[ -f \"${stats}\" ] && rm -f \"${stats}\"" EXIT

# launch p4-fusion in the background
# depends on the p4-fusion binary executable being copied to p4-fusion-binary in the gitserver Dockerfile
p4-fusion-binary "${@}" &

# capture the pid of the child process
fpid=$!

# start up a "sidecar" process to capture resource usage.
# it will terminate when the p4-fusion process terminates.
process-stats-watcher.sh "${fpid}" "p4-fusion-binary" >"${stats}" &
spid=$!

# Wait for the child process to finish
wait ${fpid} >"${waitout}" 2>&1

# capture the result of the wait, which is the result of the child process
waitcode=$?

# the sidecar process should have exited by now, but just in case, wait for it
wait "${spid}" >/dev/null 2>&1

[ ${waitcode} -eq 0 ] || {
  # if the wait exit code indicates a problem,
  # check to see if the child process was killed
  grep -qs "${fpid} Killed" "${waitout}" && {
    # get info if available from the sidecar process
    rusage=""
    [ -s "${stats}" ] && {
      # expect the last (maybe only) line to be four fields:
      # RSS VSZ ETIME TIME
      x=($(tail -1 "${stats}"))
      # NOTE: bash indexes from 0; zsh indexes from 1
      [ ${#x[@]} -eq 4 ] && rusage=" At the time of its demise, it had been running for ${x[2]}, had used ${x[3]} CPU time, reserved ${x[1]} RAM and was using ${x[0]}."
    }
    echo "p4-fusion was killed by an external signal.${rusage}"
  }
}

exit ${waitcode}
