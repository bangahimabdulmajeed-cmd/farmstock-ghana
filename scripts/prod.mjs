/**
 * Production launcher.
 *
 * The npm script cannot set `NODE_ENV=production` inline because that syntax is
 * not valid on Windows (cmd.exe and PowerShell do not support `VAR=value cmd`).
 * Setting it here keeps `pnpm start` identical on Windows, macOS, Linux and in
 * containers. An explicitly provided NODE_ENV still wins.
 */
process.env.NODE_ENV ??= "production";

await import("../dist/index.js");
