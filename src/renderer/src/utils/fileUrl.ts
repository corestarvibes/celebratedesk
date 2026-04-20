// Convert an absolute local path to a URL the renderer can load.
//
// Background: Chromium refuses to load `file://` URLs from the renderer's
// `http://localhost:5173` origin (dev) for security reasons, even with our CSP
// permitting `file:` in img-src. Instead we register a custom privileged scheme
// `celeb-local://` in the main process that resolves back to the underlying file.
//
// IMPORTANT: `celeb-local` is registered as a `standard` scheme, which means
// it REQUIRES a host after `://`. A triple-slash form like `celeb-local:///Users/foo`
// gets mangled — Chromium treats the first path segment ("Users") as the host
// and lowercases it, so you get a 404. Emit a dummy `f` host to keep the path
// intact: `celeb-local://f/Users/foo`.

export function fileUrl(path: string | null | undefined): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  // `encodeURI` preserves leading `/`, `:`, and path separators; it encodes
  // spaces to %20 and other special chars as needed.
  return 'celeb-local://f' + encodeURI(normalized)
}
