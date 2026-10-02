# Security

The extension executes only local packaged code. It does not load remote JavaScript, use eval, or create a remote extension runtime.

## Permissions

Version 1.3 requests:

- storage for synchronized extension settings;
- declarativeNetRequest for the local Ad Shield rules;
- host access to https://www.youtube.com/*;
- host access to the explicitly listed common advertising hosts in manifest.json so those requests can be blocked when initiated by YouTube.

The extension does **not** request cookies, browsing history, webRequest, tabs, or activeTab.

Ad Shield rules are scoped to YouTube initiators and intentionally do not broadly block googlevideo.com, because the same delivery infrastructure is used for ordinary YouTube media.

## Playback safety

In-player ad handling only activates while YouTube's player reports an ad state. A temporary watchdog can mute and accelerate an unskippable ad; it stores the previous playback rate and mute state, stops when the ad state clears, and restores the stored playback settings. Disabling the extension or Ad Shield also restores that state and stops the watchdog.

## Reporting

Please report security issues privately to the repository owner rather than publishing an exploit first. Do not include account cookies, tokens, browser profiles, or private YouTube data in reports.
