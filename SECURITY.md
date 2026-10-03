# Security

The extension executes only local packaged code. It does not load remote JavaScript, use eval, or create a remote extension runtime.

## Permissions

Version 1.4 requests:

- `storage` for synchronized extension settings;
- `declarativeNetRequest` for scoped local Ad Shield rules;
- host access to YouTube and the explicitly listed common advertising hosts in `manifest.json`.

The extension does not request cookies, browsing history, or remote-code permissions.

## Network scope

Ad Shield rules are scoped to YouTube initiators. The rule set intentionally does not broadly block `googlevideo.com`, because ordinary YouTube media uses the same delivery infrastructure.

## Player-response guard

The MAIN-world guard is statically declared in the manifest, requires no `scripting` permission, is packaged with the extension, and runs only on YouTube. It sanitizes a bounded set of known advertising fields from player-response objects. It does not load remote code and leaves unrelated responses unchanged.

Because YouTube changes its internal response schema, this guard is best-effort. The sanitizer has unit tests that verify playback data is preserved while known ad fields are removed.

## Playback safety

In-player ad handling activates only when the player reports an ad condition or known visible ad UI is present. A temporary watchdog can mute/accelerate a detected ad and stores the previous playback rate and mute state. When the ad condition clears, disabling Ad Shield, or disabling the extension, the watchdog stops and playback state is restored.

A short seek-to-tail fallback is used only when visible ad UI is present and the media segment is short enough to be treated as an explicit ad segment. The implementation avoids seeking long or ambiguous media.

## Reporting

Please report security issues privately to the repository owner rather than publishing an exploit first. Do not include account cookies, tokens, browser profiles, or private YouTube data in reports.
