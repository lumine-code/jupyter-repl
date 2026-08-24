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

Not part of any build or CI: the fixture is committed, and this exists to
regenerate it when the premise needs re-verifying against a newer kernel.

    python script/record_shell_fixture.py
"""

import json
import queue
import sys
import uuid
from pathlib import Path

from jupyter_client.manager import start_new_kernel

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "spec" / "fixtures" / "shell-introspection-traffic.json"

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
    ("history_request", {"output": False, "raw": True, "hist_access_type": "tail", "n": 1}),
]


def slim(message, channel):
    """Only what the transport's validation and routing read."""
    content = message["content"]
    if message["header"]["msg_type"] == "kernel_info_reply":
        content = {**content, "banner": ""}
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


def drain(get_msg, wanted, recorded, channel, deadline_each=1.0):
    """Pull every queued message parented to a request we sent."""
    while True:
        try:
            message = get_msg(timeout=deadline_each)
        except queue.Empty:
            return
        if message["parent_header"].get("msg_id") in wanted:
            recorded.append(slim(message, channel))


def main():
    manager, client = start_new_kernel(kernel_name="python3")
    try:
        recorded = []
        wanted = set()
        requests = []

        for msg_type, content in REQUESTS:
            short = msg_type.removesuffix("_request")
            msg = client.session.msg(msg_type, content)
            msg_id = f"{short}_{uuid.uuid4().hex[:8]}"
            msg["header"]["msg_id"] = msg_id
            msg["msg_id"] = msg_id
            wanted.add(msg_id)
            requests.append({"msg_id": msg_id, "msg_type": msg_type})
            client.shell_channel.send(msg)
            # One at a time, drained to quiet, so a slow reply cannot
            # interleave with the next request. Shell is drained before iopub,
            # which is why the fixture shows each reply before its status pair
            # — a drain artifact, not the wire order.
            drain(client.get_shell_msg, wanted, recorded, "shell")
            drain(client.get_iopub_msg, wanted, recorded, "iopub")

        import ipykernel
        import jupyter_client

        fixture = {
            "recordedWith": f"ipykernel {ipykernel.__version__}, jupyter_client {jupyter_client.__version__}",
            "session": client.session.session,
            "requests": requests,
            "messages": recorded,
        }
        FIXTURE_PATH.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Recorded {len(recorded)} messages for {len(requests)} requests")
        print(f"Wrote {FIXTURE_PATH}")

        missing = []
        for request in requests:
            mine = [m for m in recorded if m["parent_header"]["msg_id"] == request["msg_id"]]
            has_reply = any(m["channel"] == "shell" for m in mine)
            has_idle = any(
                m["channel"] == "iopub" and m["content"].get("execution_state") == "idle"
                for m in mine
            )
            if not (has_reply and has_idle):
                missing.append(request["msg_type"])
        if missing:
            print(f"INCOMPLETE: {missing}", file=sys.stderr)
            return 1
        return 0
    finally:
        client.stop_channels()
        manager.shutdown_kernel(now=True)


if __name__ == "__main__":
    sys.exit(main())
