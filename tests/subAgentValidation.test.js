// Ported from the Beledarian reference (beledarians-lm-studio-tools tests\subAgentValidation.test.js)
// to ESM + this repo's dist layout. Run: node --test tests/subAgentValidation.test.js
//
// Windows adaptation: path.isAbsolute() is platform-specific. The reference's
// Unix-style paths (/tmp/..., /etc/passwd, /home/..., /var/log/...) are NOT
// absolute on win32, so the absolute-path assertions use drive-letter / UNC
// paths here (same validator logic under test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateToolCall } from '../dist/subagent/toolCallValidator.js';

const isWin = process.platform === 'win32';
// An absolute path on this platform (outside any workspace)
const ABS_OUTSIDE = isWin ? 'C:\\outside\\workspace\\test.html' : '/tmp/test.html';
const ABS_UNIX_STYLE = isWin ? '\\\\server\\share\\test.html' : '/home/user/test.html';
const ABS_DRIVE = isWin ? 'C:\\var\\log\\test.html' : '/var/log/test.html';

describe('Sub-Agent Tool Validation', () => {
  describe('save_file validation', () => {
    it('should pass with correct parameters (file_name, content)', () => {
      const err = validateToolCall("save_file", { file_name: "test.html", content: "<html>" });
      assert.equal(err, null);
    });

    it('should pass with path alias (path instead of file_name)', () => {
      const err = validateToolCall("save_file", { path: "test.html", data: "<html>" });
      assert.equal(err, null);
    });

    it('should fail with absolute paths outside workspace', () => {
      const err = validateToolCall("save_file", { file_name: ABS_OUTSIDE, content: "<html>" });
      assert.ok(err?.includes("rejected absolute path"));
      assert.ok(err?.includes("SECURITY"));
    });

    it('should fail if missing content parameter', () => {
      const err = validateToolCall("save_file", { file_name: "test.html" });
      assert.ok(err?.includes("missing required parameter: 'content'"));
    });

    it('should pass with alias parameters (name, data)', () => {
      const err = validateToolCall("save_file", { name: "test.txt", data: "hello" });
      assert.equal(err, null);
    });
  });

  describe('read_file validation', () => {
    it('should pass with correct file_name', () => {
      const err = validateToolCall("read_file", { file_name: "src/index.ts" });
      assert.equal(err, null);
    });

    it('should fail if missing file_name', () => {
      const err = validateToolCall("read_file", {});
      assert.ok(err?.includes("requires parameter"));
    });

    it('should reject absolute paths for read_file', () => {
      const err = validateToolCall("read_file", { file_name: ABS_DRIVE });
      assert.ok(err?.includes("rejected absolute path"));
    });
  });

  describe('replace_text_in_file validation', () => {
    it('should pass with all required parameters', () => {
      const args = { file_name: "test.txt", old_string: "a", new_string: "b" };
      assert.ok(args.file_name && args.old_string && args.new_string);
    });

    it('should identify missing parameters', () => {
      const args = { file_name: "test.txt" };
      const missing = [];
      if (!args.file_name) missing.push("file_name");
      if (!args.old_string) missing.push("old_string");
      if (!args.new_string) missing.push("new_string");
      
      assert.equal(missing.length, 2);
    });
  });

  describe('Tool call parsing edge cases', () => {
    it('should handle empty args object gracefully', () => {
      const err = validateToolCall("save_file", {});
      assert.ok(err?.includes("requires parameters"));
    });

    it('should provide helpful hints for common mistakes (filepath, body)', () => {
      // 'filepath' and 'body' are not supported aliases - only file_name/name/path and content/data
      const err = validateToolCall("save_file", { filepath: "test.html", body: "<html>" });
      assert.ok(err?.includes("missing required parameter") || err?.includes("requires parameters"));
    });

    it('should detect absolute paths on platform-native style', () => {
      const err = validateToolCall("save_file", { file_name: ABS_UNIX_STYLE, content: "<html>" });
      assert.ok(err?.includes("rejected absolute path"));
    });

    it('should detect absolute paths with drive letters (cross-platform)', () => {
      const err = validateToolCall("save_file", { file_name: ABS_DRIVE, content: "<html>" });
      assert.ok(err?.includes("rejected absolute path"));
    });
  });
});
