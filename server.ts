import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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
import { ShellRunArgsSchema } from "./shell/schema.js";
import { ShellTestArgsSchema } from "./shell/schema.js";
import { ShellStartArgsSchema } from "./shell/schema.js";
import { ShellCheckArgsSchema } from "./shell/schema.js";
import { ShellCancelArgsSchema } from "./shell/schema.js";
import { ShellTerminalArgsSchema } from "./shell/schema.js";
import { ShellPythonArgsSchema } from "./shell/schema.js";
import { ShellCwdArgsSchema } from "./shell/schema.js";

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
import { handleShellRun } from "./shell/handler.js";
import { handleShellTest } from "./shell/handler.js";
import { handleShellStart } from "./shell/handler.js";
import { handleShellCheck } from "./shell/handler.js";
import { handleShellCancel } from "./shell/handler.js";
import { handleShellTerminal } from "./shell/handler.js";
import { handleShellPython } from "./shell/handler.js";
import { handleShellCwd } from "./shell/handler.js";
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
        version: "0.2.10",
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
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ReadFilesArgsSchema) as ToolInput,
          },
          {
            name: "write_new_files",
            description:
              "Create multiple new files in a single operation. Works on a single file too. " +
              "Fails if a file already exists unless its overwrite flag is true. " +
              "Handles text content with UTF-8 encoding, or base64 content for binary files (encoding: \"base64\"). " +
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
              "Partial failures won't stop the entire operation. " +
              "Use with caution as operation is permanent. " +
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
              "Note: files are written back with LF line endings. " +
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
              "List directory contents with [FILE] or [DIR] prefixes (single level). " +
              "Entries are sorted by name and paginated with offset/limit (default limit 100). " +
              "File sizes are shown by default (includeSizes: false to omit). " +
              "Filter with type (files/directories/all) and ignore glob patterns. " +
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
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchRegexArgsSchema) as ToolInput,
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
              "Returns size, creation time, modified time, access time, type, and permissions. " +
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
              this.allowedDirectories
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

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
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