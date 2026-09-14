import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { stripLongPathAll } from "./helpers/path.js";

// Import all schemas
import { ReadFilesArgsSchema } from "./read_files/schema.js";
import { WriteNewFilesArgsSchema } from "./write_new_files/schema.js";
import { AppendFilesArgsSchema } from "./append_files/schema.js";
import { PatchFilesArgsSchema } from "./patch_files/schema.js";
import { FileDiffArgsSchema } from "./file_diff/schema.js";
import { ContentDiffArgsSchema } from "./content_diff/schema.js";
import { DeleteFilesArgsSchema } from "./delete_files/schema.js";
import { CopyFileArgsSchema } from "./copy_files/schema.js";
import { MoveFilesArgsSchema } from "./move_files/schema.js";
import { CreateDirectoriesArgsSchema } from "./create_directories/schema.js";
import { ListDirectoryArgsSchema } from "./list_directory/schema.js";
import { DirectoryTreeArgsSchema } from "./directory_tree/schema.js";
import { SearchFilesArgsSchema } from "./search_files/schema.js";
import { SearchRegexArgsSchema } from "./search_regex/schema.js";
import { ReplaceRegexArgsSchema } from "./replace_regex/schema.js";
import { SearchGlobArgsSchema } from "./search_glob/schema.js";
import { CountLinesArgsSchema } from "./count_lines/schema.js";
import { ChecksumFilesArgsSchema } from "./checksum_files/schema.js";
import { ChecksumFilesVerifArgsSchema } from "./checksum_files_verif/schema.js";
import { GetFileInfoArgsSchema } from "./file_info/schema.js";
import { EditFilesArgsSchema } from "./edit_files/schema.js";
import { FuzzyFindFilesArgsSchema } from "./fuzzy_find_files/schema.js";
import { DeleteFilesByPatternArgsSchema } from "./delete_files_by_pattern/schema.js";
import { LaunchFileArgsSchema } from "./launch_file/schema.js";
import { ReadBytesArgsSchema } from "./read_bytes/schema.js";
import { WriteBytesArgsSchema } from "./write_bytes/schema.js";
import { DirDiffArgsSchema } from "./dir_diff/schema.js";
import { ConvertEncodingArgsSchema } from "./convert_encoding/schema.js";
import { WaitForFileArgsSchema } from "./wait_for_file/schema.js";
import { CreateLinkArgsSchema } from "./create_link/schema.js";
import { ShellRunArgsSchema } from "./shell/schema.js";
import { ShellTestArgsSchema } from "./shell/schema.js";
import { ShellStartArgsSchema } from "./shell/schema.js";
import { ShellCheckArgsSchema } from "./shell/schema.js";
import { ShellCancelArgsSchema } from "./shell/schema.js";
import { ShellTerminalArgsSchema } from "./shell/schema.js";
import { ShellPythonArgsSchema } from "./shell/schema.js";
import { ShellCwdArgsSchema } from "./shell/schema.js";
import { RunJavascriptFreeArgsSchema } from "./run_javascript/schema.js";
import { GitStatusArgsSchema } from "./git/schema.js";
import { GitDiffArgsSchema } from "./git/schema.js";
import { GitCommitArgsSchema } from "./git/schema.js";
import { GitLogArgsSchema } from "./git/schema.js";
import { GitAddArgsSchema } from "./git/schema.js";
import { GitCheckoutArgsSchema } from "./git/schema.js";

// Import all handlers
import { handleReadFiles } from "./read_files/handler.js";
import { handleWriteNewFiles } from "./write_new_files/handler.js";
import { handleAppendFiles } from "./append_files/handler.js";
import { handlePatchFiles } from "./patch_files/handler.js";
import { handleFileDiff } from "./file_diff/handler.js";
import { handleContentDiff } from "./content_diff/handler.js";
import { handleDeleteFiles } from "./delete_files/handler.js";
import { handleCopyFile } from "./copy_files/handler.js";
import { handleMoveFiles } from "./move_files/handler.js";
import { handleCreateDirectories } from "./create_directories/handler.js";
import { handleListDirectory } from "./list_directory/handler.js";
import { handleDirectoryTree } from "./directory_tree/handler.js";
import { handleSearchFiles } from "./search_files/handler.js";
import { handleSearchRegex } from "./search_regex/handler.js";
import { handleReplaceRegex } from "./replace_regex/handler.js";
import { handleSearchGlob } from "./search_glob/handler.js";
import { handleCountLines } from "./count_lines/handler.js";
import { handleChecksumFiles } from "./checksum_files/handler.js";
import { handleChecksumFilesVerif } from "./checksum_files_verif/handler.js";
import { handleGetFileInfo } from "./file_info/handler.js";
import { handleEditFiles } from "./edit_files/handler.js";
import { handleFuzzyFindFiles } from "./fuzzy_find_files/handler.js";
import { handleDeleteFilesByPattern } from "./delete_files_by_pattern/handler.js";
import { handleLaunchFile } from "./launch_file/handler.js";
import { handleReadBytes } from "./read_bytes/handler.js";
import { handleWriteBytes } from "./write_bytes/handler.js";
import { handleDirDiff } from "./dir_diff/handler.js";
import { handleConvertEncoding } from "./convert_encoding/handler.js";
import { handleWaitForFile } from "./wait_for_file/handler.js";
import { handleCreateLink } from "./create_link/handler.js";
import { handleShellRun } from "./shell/handler.js";
import { handleShellTest } from "./shell/handler.js";
import { handleShellStart } from "./shell/handler.js";
import { handleShellCheck } from "./shell/handler.js";
import { handleShellCancel } from "./shell/handler.js";
import { handleShellTerminal } from "./shell/handler.js";
import { handleShellPython } from "./shell/handler.js";
import { handleShellCwd } from "./shell/handler.js";
import { handleRunJavascriptFree } from "./run_javascript/handler.js";
import { handleGitStatus } from "./git/handler.js";
import { handleGitDiff } from "./git/handler.js";
import { handleGitCommit } from "./git/handler.js";
import { handleGitLog } from "./git/handler.js";
import { handleGitAdd } from "./git/handler.js";
import { handleGitCheckout } from "./git/handler.js";
const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

export class FilesystemServer {
  private server: Server;
  private allowedDirectories: string[];

  constructor(allowedDirectories: string[]) {
    this.allowedDirectories = allowedDirectories;
    
    this.server = new Server(
      {
        name: "secure-filesystem-server",
        version: "0.2.21",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    
    this.setupRequestHandlers();
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "read_files",
            description:
              "Read multiple files simultaneously. Works on a single file too. " +
              "Failed reads won't stop the entire operation. " +
              "Each line is prefixed with its line number (format: \"1: line content\"). " +
              "Each file's content is returned with its path as a reference. " +
              "Use offset (1-indexed start line) and/or limit (max lines) to read a range of a large file. " +
              "Each paths item may be a plain string or an object {path, encoding?, offset?, limit?}. " +
              "encoding decodes the file as 'utf8' | 'utf16le' | 'utf16be' | 'cp1252' (a matching BOM is stripped); without encoding the file's encoding is auto-detected (BOM FF FE -> utf16le, FE FF -> utf16be, EF BB BF -> utf8, otherwise strict UTF-8 -> utf8, else cp1252). " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ReadFilesArgsSchema) as ToolInput,
          },
          {
            name: "write_new_files",
            description:
              "Create multiple new files in a single operation. Works on a single file too. " +
              "Fails if a file already exists unless its overwrite flag is true. " +
              "Handles text content with UTF-8 encoding (or a per-file textEncoding of 'utf8' | 'utf16le' | 'utf16be' | 'cp1252'; utf16le/utf16be write a BOM), or base64 content for binary files (encoding: \"base64\", which writes raw bytes and wins over textEncoding). " +
              "Parent directories are created as needed. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(WriteNewFilesArgsSchema) as ToolInput,
          },
          {
            name: "append_files",
            description:
              "Append content to multiple existing files without overwriting. Works on a single file too. " +
              "Creates files if they don't exist. " +
              "Handles text content with UTF-8 encoding. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(AppendFilesArgsSchema) as ToolInput,
          },
          {
            name: "delete_files",
            description:
              "Delete multiple files or directories in a single operation. Works on a single file too. " +
              "Set recursive flag to true to delete directories with contents. " +
              "Reparse points (junctions/symlinks) are always removed as links without following them - the link target is never touched, including nested links inside recursively deleted directories. " +
              "Set toRecycleBin to true (Windows only) to send files and directories to the Recycle Bin instead of deleting permanently; reparse points are still removed as links (the bin cannot hold links), and any path that cannot be recycled is reported as an error and never permanently deleted as a fallback. " +
              "Partial failures won't stop the entire operation. " +
              "Use with caution as the default operation is permanent. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(DeleteFilesArgsSchema) as ToolInput,
          },
          {
            name: "copy_file",
            description:
              "Copy files or directories. " +
              "Set recursive flag to true to copy directories with contents. " +
              "Set overwrite flag to true to replace existing destinations. " +
              "Both source and destination must be within allowed directories.",
            inputSchema: zodToJsonSchema(CopyFileArgsSchema) as ToolInput,
          },
          {
            name: "file_diff",
            description:
              "Compare contents of two files and show differences. " +
              "Returns a unified diff showing all changes between files. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(FileDiffArgsSchema) as ToolInput,
          },
          {
            name: "content_diff",
            description:
              "Compare two text strings and show differences. " +
              "Returns a unified diff showing all changes between the contents. " +
              "Useful for comparing snippets without saving them to disk. " +
              "Custom labels can be provided for each content.",
            inputSchema: zodToJsonSchema(ContentDiffArgsSchema) as ToolInput,
          },
          {
            name: "patch_files",
            description:
              "Patch multiple files simultaneously using line numbers. Works on a single file too. " +
              "Each patch has an action: replace (default, replace lines startLine-endLine with newText), insertBefore (insert newText before startLine; startLine = total lines + 1 appends to the end), or delete (remove lines startLine-endLine). " +
              "All patches reference the original line numbers. " +
              "Shows git-style diffs for all changes (dryRun: true previews without writing). " +
              "Preserves the file's dominant line ending (CRLF or LF). " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(PatchFilesArgsSchema) as ToolInput,
          },
          {
            name: "create_directories",
            description:
              "Create multiple directory paths in one operation. Works on a single directory too. " +
              "Creates parent directories if needed. " +
              "Succeeds silently if directories exist. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(CreateDirectoriesArgsSchema) as ToolInput,
          },
          {
            name: "list_directory",
            description:
              "List directory contents with [FILE], [DIR], or [LINK] prefixes (single level). " +
              "Entries are sorted by name and paginated with offset/limit (default limit 100). " +
              "File sizes are shown by default (includeSizes: false to omit). " +
              "Filter with type (files/directories/all) and ignore glob patterns. " +
              "Reparse points (junctions/symlinks) show as [LINK] and are excluded from the files and directories filters (only listed with type 'all'); links are not stat'ed for size. " +
              "Use directory_tree for recursive views. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
          },
          {
            name: "directory_tree",
            description:
                "Get a recursive tree view of files and directories as a JSON structure. " +
                "Returns JSON with name, type, and children properties. " +
                "Supports excluding files/directories using glob patterns. " +
                "Reparse points (junctions/symlinks) appear as type 'link' with no children and are never recursed into. " +
                "Empty directories are included. " +
                "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
          },
          {
            name: "search_files",
            description:
              "Recursively search for files/directories by name substring. " +
              "Case-insensitive matching. " +
              "Supports exclude patterns with glob format. " +
              "Returns full paths to matches, paginated with offset/maxResults (default 500). " +
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
          },
          {
            name: "search_regex",
            description:
              "Search file contents using regular expressions. " +
              "path can be a directory (recursively searched) or a single file. " +
              "Supports filtering files by patterns. " +
              "Returns matching lines with line numbers, paginated with offset/maxResults (default 100). " +
              "Each occurrence of the pattern is counted (a line matching 4 times counts as 4), and the response " +
              "always ends with the total match count plus per-file counts. " +
              "Set countOnly=true to return only per-file match counts and the total, with no matching line text. " +
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchRegexArgsSchema) as ToolInput,
          },
          {
            name: "replace_regex",
            description:
              "In-place regular expression replacement across the given FILES. " +
              "paths may list one or many files (directories are NOT accepted - a directory path is an error and nothing is written). " +
              "The 'g' (global) flag is always applied so every match is replaced; additional flags such as 'i' are allowed. " +
              "dryRun defaults to TRUE: it returns per-file match counts and a unified diff preview of the WOULD-BE change without writing anything. " +
              "With dryRun=false the replacements are applied in place, preserving each file's dominant line ending (a pure-CRLF file stays fully CRLF), and per-file match counts plus a total are returned. " +
              "Any missing path or an invalid regex produces a clear error and writes nothing. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ReplaceRegexArgsSchema) as ToolInput,
          },
          {
            name: "search_glob",
            description:
              "Find files using glob patterns. " +
              "Supports powerful patterns like '**/*.js' or 'src/**/*.{ts,tsx}'. " +
              "Excludes can be specified to filter results. " +
              "Returns full paths to matching files, paginated with offset/maxResults (default 500). " +
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchGlobArgsSchema) as ToolInput,
          },
          {
            name: "count_lines",
            description:
              "Count lines in files with optional pattern matching. " +
              "Can recursively count lines in multiple files. " +
              "Filter lines with regex patterns or skip empty lines. " +
              "Returns counts by file and totals. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(CountLinesArgsSchema) as ToolInput,
          },
          {
            name: "checksum_files",
            description:
              "Generate checksums for multiple files. Works on a single file too. " +
              "Supports md5, sha1, sha256, and sha512 algorithms. " +
              "Returns hashes for all files in a consistent format. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ChecksumFilesArgsSchema) as ToolInput,
          },
          {
            name: "checksum_files_verif",
            description:
              "Verify multiple files against expected checksums. Works on a single file too. " +
              "Supports md5, sha1, sha256, and sha512 algorithms. " +
              "Returns verification results for all files. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ChecksumFilesVerifArgsSchema) as ToolInput,
          },
          {
            name: "get_file_info",
            description:
              "Get detailed file/directory metadata. " +
              "Returns size, creation time, modified time, access time, type, permissions, isReparsePoint, and (on Windows) NTFS attributes. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
          },
          {
            name: "list_allowed_directories",
            description:
              "List all directories the server is allowed to access. " +
              "No input required. " +
              "Returns directories that this server can read/write from.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        {
            name: "edit_files",
            description:
              "Edit files using exact text replacement. Works on a single file too. " +
              "Each edit specifies an oldString (exact literal text) and a newString. Edits apply in order. " +
              "By default each oldString must match exactly once (set replaceAll: true to replace all occurrences). " +
              "Line endings are handled automatically: \\n in strings matches CRLF files, and the file's dominant line ending is preserved on write. " +
              "A failed edit aborts that file before anything is written. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(EditFilesArgsSchema) as ToolInput,
          },
          {
            name: "fuzzy_find_files",
            description:
              "Fuzzy find files by name/path similarity (Levenshtein distance). " +
              "Typo-tolerant; for substring matching use search_files. " +
              "Returns the best matches with their distance scores. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(FuzzyFindFilesArgsSchema) as ToolInput,
          },
          {
            name: "delete_files_by_pattern",
            description:
              "Delete entries in a single directory whose names match a regular expression (e.g. '^temp_.*\\.txt$'). " +
              "Subdirectories are not scanned. Directories are only deleted when includeDirectories is true. " +
              "Use with caution as the operation is permanent. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(DeleteFilesByPatternArgsSchema) as ToolInput,
          },
          {
            name: "create_link",
            description:
              "Create a link object at linkPath pointing at target (Windows hardlink, directory junction, or file/directory symlink). " +
              "type: 'auto' (default) | 'symlink' | 'junction' | 'hardlink'. " +
              "target must exist (lstat-checked; clear error otherwise); linkPath must NOT already exist (clear error); linkPath's parent directory must already exist (clear error - it is NOT auto-created). " +
              "'hardlink' creates a second name for an existing file (target must be a file; same volume - cross-volume errors surface naturally). " +
              "'junction' creates a directory junction (Windows only; target must be a directory; clear error on non-Windows). " +
              "'symlink'/'auto' create a real symlink based on the target's type: directory target -> directory symlink, file target -> file symlink; 'auto' never creates a junction (junctions must be explicit). " +
              "Both paths go through the standard path validation and must be within allowed directories. " +
              "Response is short text containing the user-supplied linkPath and target (never any \\\\?\\-prefixed form) plus the actual link type created. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(CreateLinkArgsSchema) as ToolInput,
          },
          {
            name: "transfer_files",
            description:
              "Move or rename multiple files and directories in a single operation. Works on a single file too. " +
              "By default fails if any destination exists, use overwrite flag to force. " +
              "Creates parent directories of destinations if needed. " +
              "Partial failures won't stop the entire operation. " +
              "All sources and destinations must be within allowed directories.",
            inputSchema: zodToJsonSchema(MoveFilesArgsSchema) as ToolInput,
          },
          {
            name: "shell_run",
            description:
              "Execute a shell command synchronously and return exit code, stdout, and stderr. " +
              "Host is Windows; use cmd.exe syntax (e.g. `dir C:\\`, `powershell -NoProfile -Command ...`). " +
              "Optional input is piped to the command's stdin. " +
              "Optional cwd overrides the default working directory (see shell_cwd). " +
              "Bounded: default 5 s timeout, max 28 s - for anything longer use shell_start (background job) and poll with shell_check. " +
              "Non-zero exit or timeout returns an error that still includes the captured output.",
            inputSchema: zodToJsonSchema(ShellRunArgsSchema) as ToolInput,
          },
          {
            name: "shell_test",
            description:
              "Execute a test command (e.g. `npm test`, `pytest`) and return {command, exit_code, stdout, stderr, passed}. " +
              "Never errors on a failing test. Runs with CI=true. " +
              "Host is Windows; use cmd.exe syntax. " +
              "Bounded to 28 s by the MCP client timeout - for longer suites use shell_start + shell_check.",
            inputSchema: zodToJsonSchema(ShellTestArgsSchema) as ToolInput,
          },
          {
            name: "shell_start",
            description:
              "Start a long-running shell command as a background job and return immediately with a job ID. " +
              "Host is Windows; use cmd.exe syntax. " +
              "The job keeps running inside this MCP server process; output is captured (last 256 KB of stdout/stderr) and appended to a log file. " +
              "Auto-killed after timeout_hours (default 10, max 10). " +
              "Poll with shell_check; kill with shell_cancel. " +
              "Optional cwd overrides the default working directory (see shell_cwd).",
            inputSchema: zodToJsonSchema(ShellStartArgsSchema) as ToolInput,
          },
          {
            name: "shell_check",
            description:
              "Check the status and output of a shell background job started with shell_start (or a shell_terminal window). " +
              "Returns {id, name, status, exitCode, duration_seconds, stdout_tail, stderr_tail, logFile}. " +
              "Status values: running, completed, error, cancelled, timeout.",
            inputSchema: zodToJsonSchema(ShellCheckArgsSchema) as ToolInput,
          },
          {
            name: "shell_cancel",
            description:
              "Kill a running shell job (from shell_start or shell_terminal) by job ID. " +
              "Kills the whole process tree.",
            inputSchema: zodToJsonSchema(ShellCancelArgsSchema) as ToolInput,
          },
          {
            name: "shell_terminal",
            description:
              "Open a visible, separate, interactive cmd.exe console window (Windows) that runs the given command (as a batch file) with cmd /k. " +
              "The window has its own console (the user can type into it) and persists after the command finishes. " +
              "Use it for interactive sessions (ssh, REPLs, TUI programs, prompted installers) - the one case shell_start cannot cover. " +
              "Returns a job ID with the window's PID; close the window (kill the whole tree) with shell_cancel. " +
              "Optional cwd sets the window's starting directory.",
            inputSchema: zodToJsonSchema(ShellTerminalArgsSchema) as ToolInput,
          },
          {
            name: "shell_python",
            description:
              "Execute a Python code snippet (requires system Python on PATH). " +
              "Writes the code to a temp .py file and runs it. " +
              "Returns exit code, stdout, stderr. " +
              "Default 5 s timeout, max 28 s; optional cwd. " +
              "Non-zero exit returns an error that still includes the captured output.",
            inputSchema: zodToJsonSchema(ShellPythonArgsSchema) as ToolInput,
          },
          {
            name: "shell_cwd",
            description:
              "Get or set the default working directory used by the other shell_* tools. " +
              "With no argument returns the current default; with path sets it (must be an existing directory). " +
              "The default starts as the MCP server process's CWD and resets when the server restarts.",
            inputSchema: zodToJsonSchema(ShellCwdArgsSchema) as ToolInput,
          },
          {
            name: "launch_file",
            description:
              "Launch a file, folder, or web link in its Windows-associated application (the OS default: e.g. VLC for .mkv/.mp4, Explorer for folders, the default browser for http(s) URLs). " +
              "File/folder paths must be within the allowed directories (C:/, D:/, M:, NAS UNC) and are checked for existence; only http:// and https:// links are launched - file: URLs and other protocol schemes (javascript:, ms-*, steam:, vlc:) are rejected. " +
              "The launch is fully detached: it returns once Windows has spawned the shell opener - it never waits for the opened application, does not inherit the server's stdio pipes, creates no intermediary console window, and passes file names verbatim (spaces, Unicode, apostrophes, ampersands, parentheses all safe). " +
              "Errors if the path does not exist, is outside the allowed directories, the URL scheme is not http/https, or the opener fails to spawn.",
            inputSchema: zodToJsonSchema(LaunchFileArgsSchema) as ToolInput,
          },
          {
            name: "read_bytes",
            description:
              "Read raw bytes from a file at a given (offset, length). " +
              "All arguments are integers: offset >= 0, length >= 1. " +
              "An offset at or beyond the file's end (offset >= size) is an error ('offset beyond EOF'); if offset+length exceeds the file size, the read is clamped to EOF. " +
              "Returns JSON text: {path, offset, length, actualLength, size, dataBase64} where dataBase64 is base64 of the bytes actually read. " +
              "Works on binary files of any size (e.g. GGUFs, blobs). " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ReadBytesArgsSchema) as ToolInput,
          },
          {
            name: "write_bytes",
            description:
              "Write raw bytes to an existing file at a given offset (base64 input). " +
              "The file must already exist (no implicit create); invalid base64 is an error. " +
              "With the default extend=false, offset+bytes.length must not exceed the file size (else an error) and the bytes overwrite in place. " +
              "With extend=true the file is grown when the write ends past EOF, zero-filling any gap between the old size and the offset. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(WriteBytesArgsSchema) as ToolInput,
          },
          {
            name: "dir_diff",
            description:
              "Recursively compare the contents of two directory trees (files only). " +
              "Each relative path is classified as added (exists only in dirB), removed (exists only in dirA), " +
              "changed (present in both, content differs - decided by size first, then sha256), or identical. " +
              "For changed files where BOTH sides look like text (size <= 1 MiB and no NUL byte in the first 8 KiB), " +
              "a unified diff is included (diff? field, same helper as file_diff/content_diff). " +
              "ignore: array of glob patterns matched against each file's relative path (minimatch, same semantics as list_directory's ignore param); ignored paths are excluded from all lists and counts. " +
              "maxFiles: cap on total files compared (union of both trees); if the union exceeds it, the comparison stops and truncated=true (counts reflect what was compared). " +
              "Returns JSON text: {added:[{path,size}], removed:[{path,size}], changed:[{path,sizeA,sizeB,shaA,shaB,diff?}], counts:{added,removed,changed,identical,compared}, truncated}. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(DirDiffArgsSchema) as ToolInput,
          },
          {
            name: "convert_encoding",
            description:
              "Convert a file's text encoding to a new file. " +
              "Reads the source file (encoding auto-detected from its bytes unless `from` is given: BOM FF FE -> utf16le, FE FF -> utf16be, EF BB BF -> utf8, otherwise strict UTF-8 -> utf8, else cp1252), decodes it, and writes outPath encoded as `to` ('utf8' | 'utf16le' | 'utf16be' | 'cp1252'; utf16le/utf16be output includes a BOM, utf8/cp1252 do not). " +
              "outPath must differ from path and must not already exist unless overwrite=true. " +
              "Returns JSON text: {path, outPath, from (detected or given), to, bytesIn, bytesOut}. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ConvertEncodingArgsSchema) as ToolInput,
          },
          {
            name: "wait_for_file",
            description:
              "Wait until at least one file matching a glob appears under a base directory (polling watcher). " +
              "path = base directory (must be inside an allowed root); the glob is matched against each file's path relative to path " +
              "(same glob machinery as search_glob: minimatch with dot:true; on Windows backslashes in the pattern are treated as path separators). " +
              "timeoutMs defaults to 30000 (max 300000); intervalMs defaults to 500 (min 100). " +
              "Polls with an async sleep between scans so the server thread is never blocked for longer than one interval; the tool call itself may legitimately take up to timeoutMs. " +
              "As soon as at least one file matches it returns JSON text: {matched: [absolute paths], count, waitedMs, timedOut: false}; " +
              "on timeout it returns the same shape with timedOut: true (matched may be empty). " +
              "Only files are matched (directories are searched through, not matched). " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(WaitForFileArgsSchema) as ToolInput,
          },
          {
            name: "run_javascript_free",
            description:
              "Run a JavaScript/TypeScript code snippet on the Deno runtime with UNRESTRICTED permissions: full filesystem read/write (any drive or UNC path the server user can reach), network access, environment variables, child processes, and arbitrary imports (node:*, npm:*, https:*) - unlike the other run_javascript tools, there is no working-directory sandbox. " +
              "The code is written to a temp .ts file and run; returns exit code, stdout, and stderr. " +
              "Default 5 s timeout, max 60 s; optional cwd (defaults to the shell_cwd default). " +
              "Non-zero exit or timeout returns an error that still includes the captured output. " +
              "Requires a Deno binary: $DENO_PATH, <LM Studio home>/.internal/utils/deno(.exe) (found by walking up from the server CWD or the user home), or deno on PATH.",
            inputSchema: zodToJsonSchema(RunJavascriptFreeArgsSchema) as ToolInput,
          },
          {
            name: "git_status",
            description:
              "Get the current git status of the repository at the server process's current working directory (the directory the server was launched in, e.g. the chat working directory; no path argument). " +
              "Returns JSON text: {current (branch name; null for detached HEAD), tracking (upstream branch or null), ahead, behind, isClean, staged: [], notStaged: [], untracked: [], files: [{path, index, working_dir}]}. " +
              "If the working directory is not inside a git repository, returns a clear {error} string (not a crash).",
            inputSchema: zodToJsonSchema(GitStatusArgsSchema) as ToolInput,
          },
          {
            name: "git_diff",
            description:
              "Get the git diff of the repository at the server process's current working directory or specific files. " +
              "file_path (optional): path to a specific file to diff, resolved relative to the working directory. " +
              "cached (optional): show staged changes only (git diff --cached). " +
              "Returns JSON text: {diff} with the unified diff (\"No changes.\" when there is nothing to show), or a clear {error} string if the working directory is not inside a git repository.",
            inputSchema: zodToJsonSchema(GitDiffArgsSchema) as ToolInput,
          },
          {
            name: "git_commit",
            description:
              "Commit staged changes to the git repository at the server process's current working directory. " +
              "Standard git behavior: commits only what is staged (stage first with git_add). " +
              "Returns JSON text: {success: true, summary: {changed, insertions, deletions}}, or a clear {error} string (e.g. when nothing is staged).",
            inputSchema: zodToJsonSchema(GitCommitArgsSchema) as ToolInput,
          },
          {
            name: "git_log",
            description:
              "Get recent git commit history from the repository at the server process's current working directory. " +
              "max_count (optional): max number of commits to return (default: 10). " +
              "Returns JSON text: {history: ['<hash> <subject> (<author>, <date relative>)', ...]}, newest first, or a clear {error} string (e.g. when the repo has no commits).",
            inputSchema: zodToJsonSchema(GitLogArgsSchema) as ToolInput,
          },
          {
            name: "git_add",
            description:
              "Stage specific files or all changes for the next commit, in the repository at the server process's current working directory. " +
              "paths (optional): specific file paths to stage, resolved relative to the working directory; if omitted, stages all changes (git add .). " +
              "Returns JSON text: {success: true, message}, or a clear {error} string.",
            inputSchema: zodToJsonSchema(GitAddArgsSchema) as ToolInput,
          },
          {
            name: "git_checkout",
            description:
              "Switch to an existing branch, or create and switch to a new one, in the repository at the server process's current working directory. " +
              "branch_name: name of the branch to checkout. " +
              "create_new (optional, default false): if true, creates the branch if it doesn't exist (like git checkout -b). " +
              "Returns JSON text: {success: true, message}, or a clear {error} string (e.g. branch does not exist, or uncommitted changes would be overwritten).",
            inputSchema: zodToJsonSchema(GitCheckoutArgsSchema) as ToolInput,
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {

          case "read_files": {
            const parsed = ReadFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for read_files: ${parsed.error}`);
            }
            const result = await handleReadFiles(parsed.data.paths, this.allowedDirectories, parsed.data.offset, parsed.data.limit);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          
          case "write_new_files": {
            const parsed = WriteNewFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for write_new_files: ${parsed.error}`);
            }
            
            const result = await handleWriteNewFiles(parsed.data.files, this.allowedDirectories);
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          
          case "append_files": {
            const parsed = AppendFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for append_files: ${parsed.error}`);
            }
            
            const result = await handleAppendFiles(parsed.data.files, this.allowedDirectories);
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          
          case "delete_files": {
            const parsed = DeleteFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for delete_files: ${parsed.error}`);
            }
            
            const result = await handleDeleteFiles(
              parsed.data.paths,
              parsed.data.recursive,
              this.allowedDirectories,
              parsed.data.toRecycleBin
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "copy_file": {
            const parsed = CopyFileArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for copy_file: ${parsed.error}`);
            }
            
            const result = await handleCopyFile(
              parsed.data.source,
              parsed.data.destination,
              parsed.data.recursive,
              parsed.data.overwrite,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "file_diff": {
            const parsed = FileDiffArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for file_diff: ${parsed.error}`);
            }
            
            const result = await handleFileDiff(
              parsed.data.file1,
              parsed.data.file2,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "content_diff": {
            const parsed = ContentDiffArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for content_diff: ${parsed.error}`);
            }
            
            const result = await handleContentDiff(
              parsed.data.content1,
              parsed.data.content2,
              parsed.data.label1,
              parsed.data.label2
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          
          
          case "patch_files": {
            const parsed = PatchFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for patch_files: ${parsed.error}`);
            }
            
            // Extract options from the request
            const options = {
              preserveIndentation: parsed.data.options?.preserveIndentation ?? true
            };
            
            const result = await handlePatchFiles(
              parsed.data.files,
              parsed.data.dryRun,
              options,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          
          case "create_directories": {
            const parsed = CreateDirectoriesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for create_directories: ${parsed.error}`);
            }
            const result = await handleCreateDirectories(parsed.data.paths, this.allowedDirectories);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "list_directory": {
            const parsed = ListDirectoryArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
            }
            const result = await handleListDirectory(parsed.data.path, this.allowedDirectories, parsed.data.type, parsed.data.ignore, parsed.data.offset, parsed.data.limit, parsed.data.includeSizes);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "directory_tree": {
            const parsed = DirectoryTreeArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
            }

            const result = await handleDirectoryTree(
              parsed.data.path, 
              parsed.data.excludePatterns,
              this.allowedDirectories
            );
            
            return {
              content: [{
                type: "text",
                text: result
              }],
            };
          }


          case "create_link": {
            const parsed = CreateLinkArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for create_link: ${parsed.error}`);
            }

            const result = await handleCreateLink(
              parsed.data.target,
              parsed.data.linkPath,
              parsed.data.type,
              this.allowedDirectories
            );

            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "transfer_files": {
            const parsed = MoveFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for transfer_files: ${parsed.error}`);
            }
            
            const result = await handleMoveFiles(
              parsed.data.items,
              parsed.data.overwrite,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "search_files": {
            const parsed = SearchFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
            }
            
            const result = await handleSearchFiles(
              parsed.data.path,
              parsed.data.pattern,
              parsed.data.excludePatterns,
              parsed.data.maxResults,
              parsed.data.offset,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "search_regex": {
            const parsed = SearchRegexArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for search_regex: ${parsed.error}`);
            }
            
            const result = await handleSearchRegex(
              parsed.data.path,
              parsed.data.pattern,
              parsed.data.filePatterns,
              parsed.data.excludePatterns,
              parsed.data.maxResults,
              parsed.data.caseSensitive,
              parsed.data.offset,
              this.allowedDirectories,
              parsed.data.countOnly
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "replace_regex": {
            const parsed = ReplaceRegexArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for replace_regex: ${parsed.error}`);
            }

            const result = await handleReplaceRegex(
              parsed.data.paths,
              parsed.data.pattern,
              parsed.data.replacement,
              parsed.data.flags,
              parsed.data.dryRun,
              this.allowedDirectories
            );

            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "search_glob": {
            const parsed = SearchGlobArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for search_glob: ${parsed.error}`);
            }
            
            const result = await handleSearchGlob(
              parsed.data.path,
              parsed.data.pattern,
              parsed.data.excludePatterns,
              parsed.data.maxResults,
              parsed.data.offset,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "count_lines": {
            const parsed = CountLinesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for count_lines: ${parsed.error}`);
            }
            
            const result = await handleCountLines(
              parsed.data.path,
              parsed.data.recursive,
              parsed.data.pattern,
              parsed.data.filePattern,
              parsed.data.excludePatterns,
              parsed.data.ignoreEmptyLines,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          
          
          case "checksum_files": {
            const parsed = ChecksumFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for checksum_files: ${parsed.error}`);
            }
            
            const result = await handleChecksumFiles(
              parsed.data.paths,
              parsed.data.algorithm,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "checksum_files_verif": {
            const parsed = ChecksumFilesVerifArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for checksum_files_verif: ${parsed.error}`);
            }
            
            const result = await handleChecksumFilesVerif(
              parsed.data.files,
              parsed.data.algorithm,
              this.allowedDirectories
            );
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "get_file_info": {
            const parsed = GetFileInfoArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
            }
            
            const result = await handleGetFileInfo(parsed.data.path, this.allowedDirectories);
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "list_allowed_directories": {
            return {
              content: [{
                type: "text",
                text: `Allowed directories:\n${this.allowedDirectories.join('\n')}`
              }],
            };
          }

          case "edit_files": {
            const parsed = EditFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for edit_files: ${parsed.error}`);
            }

            const result = await handleEditFiles(parsed.data.files, this.allowedDirectories);

            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "fuzzy_find_files": {
            const parsed = FuzzyFindFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for fuzzy_find_files: ${parsed.error}`);
            }

            const result = await handleFuzzyFindFiles(
              parsed.data.query,
              parsed.data.path,
              parsed.data.recursive,
              parsed.data.maxResults,
              parsed.data.scanLimit,
              this.allowedDirectories
            );

            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "delete_files_by_pattern": {
            const parsed = DeleteFilesByPatternArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for delete_files_by_pattern: ${parsed.error}`);
            }

            const result = await handleDeleteFilesByPattern(
              parsed.data.directory,
              parsed.data.pattern,
              parsed.data.includeDirectories,
              this.allowedDirectories
            );

            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_run": {
            const parsed = ShellRunArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_run: ${parsed.error}`);
            }
            const result = await handleShellRun(
              parsed.data.command,
              parsed.data.input,
              parsed.data.timeout_seconds,
              parsed.data.cwd
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_test": {
            const parsed = ShellTestArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_test: ${parsed.error}`);
            }
            const result = await handleShellTest(parsed.data.command, parsed.data.cwd);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_start": {
            const parsed = ShellStartArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_start: ${parsed.error}`);
            }
            const result = await handleShellStart(
              parsed.data.command,
              parsed.data.name,
              parsed.data.timeout_hours,
              parsed.data.cwd
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_check": {
            const parsed = ShellCheckArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_check: ${parsed.error}`);
            }
            const result = await handleShellCheck(parsed.data.id);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_cancel": {
            const parsed = ShellCancelArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_cancel: ${parsed.error}`);
            }
            const result = await handleShellCancel(parsed.data.id);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_terminal": {
            const parsed = ShellTerminalArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_terminal: ${parsed.error}`);
            }
            const result = await handleShellTerminal(parsed.data.command, parsed.data.cwd);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_python": {
            const parsed = ShellPythonArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_python: ${parsed.error}`);
            }
            const result = await handleShellPython(
              parsed.data.python,
              parsed.data.timeout_seconds,
              parsed.data.cwd
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "shell_cwd": {
            const parsed = ShellCwdArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for shell_cwd: ${parsed.error}`);
            }
            const result = await handleShellCwd(parsed.data.path);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "launch_file": {
            const parsed = LaunchFileArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for launch_file: ${parsed.error}`);
            }
            const result = await handleLaunchFile(parsed.data.path, this.allowedDirectories);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "read_bytes": {
            const parsed = ReadBytesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for read_bytes: ${parsed.error}`);
            }
            const result = await handleReadBytes(
              parsed.data.path,
              parsed.data.offset,
              parsed.data.length,
              this.allowedDirectories
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "write_bytes": {
            const parsed = WriteBytesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for write_bytes: ${parsed.error}`);
            }
            const result = await handleWriteBytes(
              parsed.data.path,
              parsed.data.offset,
              parsed.data.dataBase64,
              parsed.data.extend,
              this.allowedDirectories
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "dir_diff": {
            const parsed = DirDiffArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for dir_diff: ${parsed.error}`);
            }
            const result = await handleDirDiff(
              parsed.data.dirA,
              parsed.data.dirB,
              parsed.data.ignore,
              parsed.data.maxFiles,
              this.allowedDirectories
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "convert_encoding": {
            const parsed = ConvertEncodingArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for convert_encoding: ${parsed.error}`);
            }
            const result = await handleConvertEncoding(
              parsed.data.path,
              parsed.data.to,
              parsed.data.from,
              parsed.data.outPath,
              parsed.data.overwrite,
              this.allowedDirectories
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "wait_for_file": {
            const parsed = WaitForFileArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for wait_for_file: ${parsed.error}`);
            }
            const result = await handleWaitForFile(
              parsed.data.path,
              parsed.data.glob,
              parsed.data.timeoutMs,
              parsed.data.intervalMs,
              this.allowedDirectories
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "run_javascript_free": {
            const parsed = RunJavascriptFreeArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for run_javascript_free: ${parsed.error}`);
            }
            const result = await handleRunJavascriptFree(
              parsed.data.javascript,
              parsed.data.timeout_seconds,
              parsed.data.cwd
            );
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "git_status": {
            const parsed = GitStatusArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for git_status: ${parsed.error}`);
            }
            const result = await handleGitStatus();
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "git_diff": {
            const parsed = GitDiffArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for git_diff: ${parsed.error}`);
            }
            const result = await handleGitDiff(parsed.data.file_path, parsed.data.cached);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "git_commit": {
            const parsed = GitCommitArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for git_commit: ${parsed.error}`);
            }
            const result = await handleGitCommit(parsed.data.message);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "git_log": {
            const parsed = GitLogArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for git_log: ${parsed.error}`);
            }
            const result = await handleGitLog(parsed.data.max_count);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "git_add": {
            const parsed = GitAddArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for git_add: ${parsed.error}`);
            }
            const result = await handleGitAdd(parsed.data.paths);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "git_checkout": {
            const parsed = GitCheckoutArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for git_checkout: ${parsed.error}`);
            }
            const result = await handleGitCheckout(parsed.data.branch_name, parsed.data.create_new);
            return {
              content: [{ type: "text", text: result }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        // Never surface the internal \\?\ long-path prefix in error text.
        const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Secure MCP Filesystem Server running on stdio");
    console.error("Allowed directories:", this.allowedDirectories);
  }
}