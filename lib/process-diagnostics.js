const { StringDecoder } = require("node:string_decoder");

const MAX_LINE_LENGTH = 8192;
const MAX_TAIL_LENGTH = 16384;

// Child-process data events are transport chunks, not logging records. Decode
// UTF-8 and frame complete lines before assigning severity, while retaining a
// bounded tail for a process that subsequently fails.
class ProcessDiagnostics {
  constructor(onRecord, { maxLineLength = MAX_LINE_LENGTH, maxTailLength = MAX_TAIL_LENGTH } = {}) {
    this.onRecord = onRecord;
    this.maxLineLength = maxLineLength;
    this.maxTailLength = maxTailLength;
    this.decoder = new StringDecoder("utf8");
    this.pending = "";
    this.tail = "";
    this.lineTruncated = false;
    this.tailTruncated = false;
    this.ended = false;
  }

  write(chunk) {
    if (this.ended) return;
    this.accept(this.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
  }

  accept(text) {
    if (!text) return;
    this.tailTruncated ||= this.tail.length + text.length > this.maxTailLength;
    this.tail = (this.tail + text).slice(-this.maxTailLength);
    // A bounded slice must not leave half of a decoded surrogate pair.
    if (/^[\uDC00-\uDFFF]/.test(this.tail)) this.tail = this.tail.slice(1);
    let start = 0;
    let end;
    while ((end = text.indexOf("\n", start)) !== -1) {
      this.append(text.slice(start, end));
      this.publish();
      start = end + 1;
    }
    this.append(text.slice(start));
  }

  append(text) {
    const available = this.maxLineLength - this.pending.length;
    this.lineTruncated ||= text.length > available;
    this.pending += text.slice(0, available);
    if (/[\uD800-\uDBFF]$/.test(this.pending)) this.pending = this.pending.slice(0, -1);
  }

  publish() {
    const text =
      this.pending.replace(/\r$/, "") + (this.lineTruncated ? " … [diagnostic truncated]" : "");
    this.pending = "";
    this.lineTruncated = false;
    if (!text.trim()) return;
    const match = text.match(
      /^\[[^\]\r\n]+\]\s+(DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL|FATAL)\s+\|/i,
    );
    this.onRecord({
      text,
      level: match ? match[1].toUpperCase().replace(/^WARN$/, "WARNING") : null,
    });
  }

  end() {
    if (this.ended) return;
    this.accept(this.decoder.end());
    this.publish();
    this.ended = true;
  }

  getTail() {
    return (this.tailTruncated ? "[Earlier process diagnostics truncated]\n" : "") + this.tail;
  }
}

module.exports = ProcessDiagnostics;
