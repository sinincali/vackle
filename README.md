# Vackle

![](https://img.shields.io/github/package-json/v/sinincali/vackle?style=for-the-badge&logo=github&logoColor=fff&label=&color=1d2021&labelColor=282828)

Flackle client mod

## Features

-   Easy to install: one `Vackle.exe` finds Flackle and sets everything up
-   50+ built in plugins
-   Fairly lightweight despite the many inbuilt plugins
-   Custom CSS and Themes: Inbuilt css editor with support to import any css files
-   Safe updates: every release is signed, and a broken update is rolled back automatically
-   Never touches Flackle's own files: uninstalling restores everything as it was

## Installing / Uninstalling

Download `Vackle.exe` from the [latest release](https://github.com/sinincali/vackle/releases/latest) and run it

Vackle is made for a PC only you use. While Flackle is open with Vackle, other Windows accounts signed in on the same PC could reach your Flackle session.

### Browser extension (flackle.com in Chrome, Edge, Brave or Firefox)

Download `extension.zip` from the [latest release](https://github.com/sinincali/vackle/releases/latest) and unzip it. Open `chrome://extensions` (`brave://extensions` in Brave), turn on Developer mode, click Load unpacked and pick the unzipped folder. To remove it, remove the extension.

### Userscript (flackle.com with Tampermonkey or Violentmonkey)

Install [Tampermonkey](https://www.tampermonkey.net) or [Violentmonkey](https://violentmonkey.github.io), then open [Vackle.user.js](https://github.com/sinincali/vackle/releases/download/devbuild/Vackle.user.js) and click Install. It updates itself. In Chrome and Edge, turn on "Allow User Scripts" in the userscript manager's extension details. In Firefox, use Tampermonkey. Use either the extension or the userscript, not both.

The userscript can't block ads in YouTube embeds, and its settings are separate from the extension's.

## Join our Support/Community Server

[Join the server](https://flackle.com/invite/7VW8IXBE)

## Star History

<a href="https://star-history.com/#sinincali/vackle&Timeline">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sinincali/vackle&type=Timeline&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sinincali/vackle&type=Timeline" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sinincali/vackle&type=Timeline" />
  </picture>
</a>

## Disclaimer

Flackle is a trademark of its respective owner and solely mentioned for the sake of descriptivity.
Mention of it does not imply any affiliation with or endorsement by Flackle.

<details>
<summary>Why some antivirus programs flag Vackle.exe</summary>

A couple of antivirus engines flag Vackle.exe with generic "suspicious" labels, not a known virus. Vackle runs hidden PowerShell commands to find Flackle, make shortcuts and check running programs, which some malware also does. Vackle.exe is also not code signed yet, so every new build looks unknown, and it is built on Node.js so it still calls itself node.exe inside. Vackle is open source and every release is built from this repository by GitHub Actions.

</details>

<details>
<summary>Using Vackle may violate Flackle's terms of service</summary>

Flackle's Terms ban modifying the client to get around plan limits, like screenshare quality or bitrate caps. Vackle doesn't touch plan limits and never automates your account. The wording is broad, though, so no client mod is risk-free. If losing your account would be a disaster, don't use one

</details>
