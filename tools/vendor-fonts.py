"""Refresh committed, self-hosted webfonts. Not needed by the site build."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1] / '_theme_overrides/shiro/source'
FAMILIES = {
    'Great Vibes': ('greatvibes', ''),
    'Cormorant Garamond': ('cormorantgaramond', ':wght@400'),
    'Noto Serif SC': ('notoserifsc', ':wght@400..700'),
    'Noto Sans SC': ('notosanssc', ':wght@400..600'),
    'Noto Sans Mono': ('notosansmono', ':wght@400..600'),
}
USER_AGENT = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')


def fetch(url: str) -> bytes:
    with urlopen(Request(url, headers={'User-Agent': USER_AGENT}), timeout=60) as response:
        return response.read()


def main() -> None:
    query = [('family', name + axes) for name, (_, axes) in FAMILIES.items()]
    source_url = 'https://fonts.googleapis.com/css2?' + urlencode(query + [('display', 'swap')])
    css = fetch(source_url).decode('utf-8')
    assets: dict[str, dict[str, str]] = {}

    def localize(match: re.Match[str]) -> str:
        rule = match.group(0)
        family = re.search(r"font-family: '([^']+)'", rule)
        remote = re.search(r'url\((https://fonts.gstatic.com/[^)]+)\)', rule)
        if family is None or remote is None or not remote[1].endswith('.woff2'):
            raise ValueError('Expected a WOFF2 @font-face from Google Fonts')
        slug = FAMILIES[family[1]][0]
        filename = f'{slug}/{hashlib.sha256(remote[1].encode()).hexdigest()[:12]}.woff2'
        assets[filename] = {'family': family[1], 'source': remote[1]}
        # A separate name lets CSS prefer the installed family with its own
        # weight matching before considering the bundled variable web font.
        return rule.replace(f"font-family: '{family[1]}'", f"font-family: 'Folio {family[1]}'").replace(remote[1], '../fonts/' + filename)

    local_css = re.sub(r'@font-face\s*\{[^}]+\}', localize, css)
    if not assets:
        raise ValueError('No font assets found')

    def download(item: tuple[str, dict[str, str]]) -> None:
        filename, metadata = item
        content = fetch(metadata['source'])
        if content[:4] != b'wOF2':
            raise ValueError(f'Invalid WOFF2: {filename}')
        target = ROOT / 'fonts' / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        metadata['sha256'] = hashlib.sha256(content).hexdigest()

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(download, assets.items()))
    for slug, _ in FAMILIES.values():
        license_url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{slug}/OFL.txt'
        (ROOT / 'fonts' / slug / 'OFL.txt').write_bytes(fetch(license_url))
    (ROOT / 'css/fonts.css').write_text('/* Self-hosted SIL OFL fonts; refresh with tools/vendor-fonts.py. */\n' + local_css)
    manifest = {'stylesheetSource': source_url, 'assets': assets}
    (ROOT / 'fonts/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Vendored {len(assets)} WOFF2 subsets for {len(FAMILIES)} font families.')


if __name__ == '__main__':
    main()
