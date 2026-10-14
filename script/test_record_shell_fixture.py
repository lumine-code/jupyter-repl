"""Verify that recording live traffic cannot copy an operator's IPython history.

Run with: python -B -m unittest discover -s script -p test_record_shell_fixture.py
Requires the same ipykernel and jupyter_client as the recorder.
"""

import json
import os
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from jupyter_client.manager import start_new_kernel

import record_shell_fixture as recorder


class FixturePrivacyTests(unittest.TestCase):
    def test_keeps_only_the_verified_history_fields(self):
        marker = f"synthetic-private-history-{uuid.uuid4().hex}"
        safe = {"status": "ok", "history": [[0, 1, recorder.HISTORY_CODE]]}
        self.assertEqual(recorder.fixture_history({**safe, "unexpected": marker}), safe)

    def test_rejects_foreign_history_without_exposing_it_in_errors(self):
        marker = f"synthetic-private-history-{uuid.uuid4().hex}"
        for history in [
            [[0, 1, marker]],
            [[0, 1, recorder.HISTORY_CODE], [0, 2, marker]],
            [[0, 1, [recorder.HISTORY_CODE, marker]]],
            [[0, 2, recorder.HISTORY_CODE]],
            [[1, 1, recorder.HISTORY_CODE]],
            [],
        ]:
            with self.subTest(shape=len(history)):
                with self.assertRaises(ValueError) as rejected:
                    recorder.fixture_history({"status": "ok", "history": history})
                self.assertNotIn(marker, str(rejected.exception))

    def test_partial_capture_does_not_overwrite_the_fixture(self):
        with tempfile.TemporaryDirectory(prefix="lumine-fixture-output-") as directory:
            destination = Path(directory) / "fixture.json"
            destination.write_text("existing fixture", encoding="utf-8")
            with (
                patch.object(recorder, "FIXTURE_PATH", destination),
                patch.object(recorder, "record_fixture", side_effect=RuntimeError("Incomplete capture")),
            ):
                with self.assertRaises(RuntimeError):
                    recorder.main()
            self.assertEqual(destination.read_text(encoding="utf-8"), "existing fixture")

    def test_real_recording_ignores_persistent_history_and_user_startup(self):
        marker = f"synthetic-private-history-{uuid.uuid4().hex}"
        with tempfile.TemporaryDirectory(prefix="lumine-external-ipython-") as directory:
            external = Path(directory)
            profile = external / "profile_default"
            profile.mkdir()
            history_file = profile / "history.sqlite"
            environment = {**os.environ, "IPYTHONDIR": str(external)}
            manager, client = start_new_kernel(
                kernel_name="python3",
                cwd=directory,
                env=environment,
                extra_arguments=[
                    f"--IPKernelApp.ipython_dir={external}",
                    "--IPKernelApp.profile=default",
                    f"--HistoryManager.hist_file={history_file}",
                ],
            )
            try:
                request_id = client.execute(f"private_history_marker = {marker!r}", store_history=True)
                reply = recorder.round_trip(client, request_id)
                self.assertEqual(reply[0]["content"]["status"], "ok")
                flush_id = client.execute("get_ipython().history_manager.writeout_cache()", silent=True, store_history=False)
                flush = recorder.round_trip(client, flush_id)
                self.assertEqual(flush[0]["content"]["status"], "ok")
            finally:
                client.stop_channels()
                manager.shutdown_kernel(now=True)

            # Prove that a separate real kernel left the sentinel in a durable
            # history database, rather than merely setting an unused variable.
            with closing(sqlite3.connect(history_file)) as database:
                rows = database.execute("SELECT source_raw FROM history").fetchall()
            self.assertTrue(any(marker in row[0] for row in rows))
            original_history = history_file.read_bytes()
            startup = profile / "startup"
            startup.mkdir(exist_ok=True)
            (startup / "00-private.py").write_text(
                f"private_startup_marker = {marker!r}\n", encoding="utf-8"
            )

            # Simulate launching the recorder from a configured user profile.
            # It must not load that profile or modify its history database.
            with patch.dict(os.environ, {"IPYTHONDIR": directory}):
                fixture = recorder.record_fixture()
            serialized = json.dumps(fixture)
            self.assertNotIn(marker, serialized)
            self.assertNotIn("private_history_marker", serialized)
            self.assertNotIn("private_startup_marker", serialized)
            self.assertNotIn(directory, serialized)
            self.assertEqual(history_file.read_bytes(), original_history)
            history = next(message for message in fixture["messages"] if message["header"]["msg_type"] == "history_reply")
            self.assertEqual(history["content"]["history"][0][1:], [1, recorder.HISTORY_CODE])
            self.assertEqual(len(fixture["requests"]), 6)
            self.assertEqual(len(fixture["messages"]), 18)


if __name__ == "__main__":
    unittest.main()
