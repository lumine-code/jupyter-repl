"""Record real kernel traffic for spec/fixtures/shell-introspection-traffic.json.

The transport's central premise - every shell request is answered by a reply on
shell and a busy/idle pair on iopub, parented to it - is what unified
retirement, the suppression floor and the half-settled reclaim all stand on,
and hand-written specs can only prove the transport agrees with itself. This
captures what an actual kernel sends for each non-cell request type, so the
replay spec pins the premise against ground truth.

Recorded through jupyter_client, the reference client, rather than the
package's own transport: the bundled zeromq is built for Electron's ABI and
asserts under plain Node, and a spec renderer cannot construct a real socket
at all (see spec/jmp-socket-spec.js). What matters is what the kernel sends,
and that is the same whoever asks.

Builds and CI use the committed fixture. CI also exercises the recorder's
privacy tests without rewriting it; regenerate it manually when the premise
needs re-verifying against a newer kernel.

    python script/record_shell_fixture.py
"""

import json
import os
import queue
import sys
import tempfile
import time
import uuid
from pathlib import Path

from jupyter_client.manager import start_new_kernel

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "spec" / "fixtures" / "shell-introspection-traffic.json"
HISTORY_CODE = "1 + 1"

# One request per non-cell type a plain kernel can answer without a comm
# target. The comm_* messages are excluded: opening a comm needs a registered
# target on the kernel side, and their acknowledgement-by-status-pair-only
# shape is already pinned by hand-written specs.
REQUESTS = [
    ("kernel_info_request", {}),
    ("complete_request", {"code": "pri", "cursor_pos": 3}),
    ("inspect_request", {"code": "print", "cursor_pos": 5, "detail_level": 0}),
    ("comm_info_request", {}),
    ("is_complete_request", {"code": "print(1)"}),
    (
        "history_request",
        {"output": False, "raw": True, "hist_access_type": "range", "session": 0, "start": 1, "stop": 2},
    ),
]


def fixture_history(content):
    """Reject unexpected history before any source code reaches the fixture."""
    history = content.get("history")
    if content.get("status") != "ok" or not isinstance(history, list) or len(history) != 1:
        raise ValueError("Refusing to record unexpected kernel history")
    row = history[0]
    if (
        not isinstance(row, (list, tuple))
        or len(row) != 3
        or type(row[0]) is not int
        or row[0] != 0
        or type(row[1]) is not int
        or row[1] != 1
        or row[2] != HISTORY_CODE
    ):
        # Do not include the rejected payload in an exception or console output.
        raise ValueError("Refusing to record code other than the fixture cell")
    return {"status": "ok", "history": [list(row)]}


def slim(message, channel):
    """Only what the transport's validation and routing read."""
    content = message["content"]
    if message["header"]["msg_type"] == "kernel_info_reply":
        content = {**content, "banner": ""}
    elif message["header"]["msg_type"] == "history_reply":
        content = fixture_history(content)
    return {
        "channel": channel,
        "header": {
            "msg_id": message["header"]["msg_id"],
            "msg_type": message["header"]["msg_type"],
        },
        "parent_header": {
            "session": message["parent_header"]["session"],
            "msg_id": message["parent_header"]["msg_id"],
            "msg_type": message["parent_header"]["msg_type"],
        },
        "content": content,
    }


def round_trip(client, request_id, timeout=15.0):
    """Wait for this request's shell reply and iopub idle, ignoring startup traffic."""
    recorded = []
    deadline = time.monotonic() + timeout
    # Drain shell before iopub as the original recorder did. The fixture
    # deliberately exercises reply-before-idle, not the kernel's wire order.
    for channel, get_msg in [("shell", client.get_shell_msg), ("iopub", client.get_iopub_msg)]:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError("Timed out waiting for the fixture request")
            try:
                message = get_msg(timeout=remaining)
            except queue.Empty as error:
                raise RuntimeError("Timed out waiting for the fixture request") from error
            if message["parent_header"].get("msg_id") != request_id:
                continue
            recorded.append(slim(message, channel))
            if channel == "shell" or message["content"].get("execution_state") == "idle":
                break
    return recorded


def validate_fixture(fixture):
    """A partial capture must never overwrite the known working fixture."""
    for request in fixture["requests"]:
        mine = [message for message in fixture["messages"] if message["parent_header"]["msg_id"] == request["msg_id"]]
        replies = [message for message in mine if message["channel"] == "shell"]
        busy = [message for message in mine if message["content"].get("execution_state") == "busy"]
        idle = [message for message in mine if message["content"].get("execution_state") == "idle"]
        if (
            len(replies) != 1
            or replies[0]["header"]["msg_type"] != request["msg_type"].replace("_request", "_reply")
            or len(busy) != 1
            or len(idle) != 1
        ):
            raise RuntimeError(f"Incomplete fixture round trip: {request['msg_type']}")


def record_fixture():
    # A fresh kernel alone still reads the user's durable IPython history and
    # startup configuration. Isolate both, and pass explicit command-line
    # paths so a kernelspec cannot override the environment's IPYTHONDIR.
    with tempfile.TemporaryDirectory(prefix="lumine-shell-fixture-") as directory:
        ipython_directory = Path(directory) / "ipython"
        profile = ipython_directory / "profile_fixture"
        profile.mkdir(parents=True)
        environment = {**os.environ, "IPYTHONDIR": str(ipython_directory)}
        environment.pop("PYTHONSTARTUP", None)
        manager, client = start_new_kernel(
            kernel_name="python3",
            cwd=directory,
            env=environment,
            extra_arguments=[
                f"--IPKernelApp.ipython_dir={ipython_directory}",
                "--IPKernelApp.profile=fixture",
                f"--HistoryManager.hist_file={profile / 'history.sqlite'}",
            ],
        )
        try:
            # Execute a real, harmless cell. Only this session and execution
            # number are requested, regardless of durable history elsewhere.
            seed_id = client.execute(HISTORY_CODE, store_history=True)
            seed = round_trip(client, seed_id)
            if seed[0]["content"].get("status") != "ok":
                raise RuntimeError("The fixture cell did not execute successfully")
            recorded = []
            requests = []
            for msg_type, content in REQUESTS:
                short = msg_type.removesuffix("_request")
                msg = client.session.msg(msg_type, content)
                msg_id = f"{short}_{uuid.uuid4().hex[:8]}"
                msg["header"]["msg_id"] = msg_id
                msg["msg_id"] = msg_id
                requests.append({"msg_id": msg_id, "msg_type": msg_type})
                client.shell_channel.send(msg)
                recorded.extend(round_trip(client, msg_id))

            import ipykernel
            import jupyter_client

            fixture = {
                "recordedWith": f"ipykernel {ipykernel.__version__}, jupyter_client {jupyter_client.__version__}",
                "session": client.session.session,
                "requests": requests,
                "messages": recorded,
            }
            validate_fixture(fixture)
            return fixture
        finally:
            client.stop_channels()
            manager.shutdown_kernel(now=True)


def main():
    fixture = record_fixture()
    FIXTURE_PATH.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Recorded {len(fixture['messages'])} messages for {len(fixture['requests'])} requests")
    print(f"Wrote {FIXTURE_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
