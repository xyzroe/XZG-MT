#!/usr/bin/env python3
import os, re, requests
from bs4 import BeautifulSoup

OWNER   = os.environ["GH_OWNER"]
REPO    = os.environ["GH_REPO"]
IMAGE   = os.environ["GH_IMAGE"]  

url = f"https://github.com/{OWNER}/{REPO}/pkgs/container/{IMAGE}"
r = requests.get(url)
r.raise_for_status()

soup = BeautifulSoup(r.text, "html.parser")
total_downloads = 0

# Iterate all <h3> elements and look for a nearby <span> with label "Total downloads".
# Stop at the first matching card; do NOT fallback to the old span-based search.
total_downloads = 0
found = False
for h3 in soup.find_all("h3"):
    parent = h3.parent
    if not parent:
        continue
    # Look for a sibling/child span in the same parent containing the label
    for sp in parent.find_all("span"):
        if "total downloads" in sp.get_text(strip=True).lower():
            # Found the correct card — extract the number
            title_val = h3.get("title")
            if title_val and re.match(r"^\d+$", title_val):
                total_downloads = int(title_val)
                found = True
                break
            # Parse human-readable like "2.88K"
            txt = h3.get_text(strip=True)
            m = re.match(r"([0-9]*\.?[0-9]+)\s*([KMkm])?", txt)
            if m:
                num = float(m.group(1))
                suf = m.group(2)
                if suf:
                    if suf.upper() == "K":
                        num *= 1000
                    elif suf.upper() == "M":
                        num *= 1000000
                total_downloads = int(num)
                found = True
                break
    if found:
        break

badge = {
    "schemaVersion": 1,
    "label": "ghcr pulls",
    "message": str(total_downloads),
    "color": "blue",
}

import json, sys
json.dump(badge, sys.stdout)
