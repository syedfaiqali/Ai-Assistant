// Incremental SSE framing: handles UTF-8 outside this parser, CRLF split across
// reads, multiline data, comments, and a bounded unfinished event.
export class SSEParser {
  private buffer = ''; private data: string[] = [];
  constructor(private onData: (data: string) => void) {}
  feed(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 262144) throw new Error('Stream event exceeds limit');
    let index: number;
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      if (!line) { if (this.data.length) this.onData(this.data.join('\n')); this.data = []; }
      else if (line.startsWith('data:')) this.data.push(line.slice(5).replace(/^ /, ''));
      if (this.data.join('').length > 262144) throw new Error('Stream event exceeds limit');
    }
  }
  finish() { if (this.buffer || this.data.length) throw new Error('Incomplete streaming event'); }
}
