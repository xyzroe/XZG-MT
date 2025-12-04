import json
import os
import re
from collections import Counter

def get_repo_url(url):
    # Check for Sonoff dongle flasher URLs
    if "dongle.sonoff.tech" in url:
        return "https://dongle.sonoff.tech/sonoff-dongle-flasher/"
    
    match = re.match(r"(https://github\.com/[^/]+/[^/]+)", url)
    if match:
        return match.group(1)
    
    match = re.match(r"https://raw\.githubusercontent\.com/([^/]+)/([^/]+)", url)
    if match:
        return f"https://github.com/{match.group(1)}/{match.group(2)}"
    
    return None

def get_ti_repos():
    task_path = os.path.join("ti", "task.json")
    repo_counts = Counter()
    if os.path.exists(task_path):
        with open(task_path, "r") as f:
            tasks = json.load(f)
            for task in tasks:
                if "link" in task:
                    repo = get_repo_url(task["link"])
                    if repo:
                        repo_counts[repo] += 1
    return repo_counts

def get_sl_repos():
    manifest_path = os.path.join("sl", "manifest.json")
    repo_counts = Counter()
    if os.path.exists(manifest_path):
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
            for category in manifest:
                for chip in manifest[category]:
                    for board in manifest[category][chip]:
                        for filename, info in manifest[category][chip][board].items():
                            if "link" in info:
                                repo = get_repo_url(info["link"])
                                if repo:
                                    repo_counts[repo] += 1
    return repo_counts

def count_ti_files(manifest, category):
    count = 0
    if category in manifest:
        for chip in manifest[category]:
            count += len(manifest[category][chip])
    return count

def count_sl_files(manifest, category):
    count = 0
    if category in manifest:
        for chip in manifest[category]:
            for board in manifest[category][chip]:
                count += len(manifest[category][chip][board])
    return count

def update_section(content, section_name, counts, repo_counts, repo_header):
    section_start = content.find(f"## {section_name}")
    if section_start == -1:
        return content
    
    next_section_match = re.search(r"\n## ", content[section_start + 1:])
    if next_section_match:
        section_end = section_start + 1 + next_section_match.start()
    else:
        section_end = len(content)

    section_content = content[section_start:section_end]

    for badge_name, count in counts.items():
        pattern = f"(badge/{badge_name}-)(\\d+)(_files)"
        section_content = re.sub(pattern, f"\\g<1>{count}\\g<3>", section_content)

    repo_start = section_content.find(repo_header)
    
    if repo_start != -1:
        pre_repo = section_content[:repo_start + len(repo_header)]
        
        # Sort by count descending
        sorted_repos = sorted(repo_counts.items(), key=lambda item: item[1], reverse=True)
        
        repo_list = "\n\n"
        for repo_url, count in sorted_repos:
            # Check for Sonoff dongle flasher
            if "dongle.sonoff.tech" in repo_url:
                repo_list += f"- [SONOFF Dongle Flasher]({repo_url})\n"
            else:
                # Extract owner/repo from url
                match = re.match(r"https://github\.com/([^/]+/[^/]+)", repo_url)
                repo_name = match.group(1) if match else repo_url
                repo_list += f"- [{repo_name}]({repo_url})\n"
        repo_list += "\n"
        
        section_content = pre_repo + repo_list
    
    return content[:section_start] + section_content + content[section_end:]

def update_readme():
    readme_path = "README.md"
    if not os.path.exists(readme_path):
        print(f"README file not found at {readme_path}")
        return

    with open(readme_path, "r") as f:
        content = f.read()

    # Process Ti
    ti_manifest_path = os.path.join("ti", "manifest.json")
    if os.path.exists(ti_manifest_path):
        with open(ti_manifest_path, "r") as f:
            ti_manifest = json.load(f)
        
        ti_counts = {
            "Zigbee_Router": count_ti_files(ti_manifest, "router"),
            "Zigbee_Coordinator": count_ti_files(ti_manifest, "coordinator"),
            "OpenThread": count_ti_files(ti_manifest, "thread")
        }
        ti_repos = get_ti_repos()
        content = update_section(content, "♥️ Ti", ti_counts, ti_repos, "Downloaded from:")
        print(f"Ti Counts: {ti_counts}")

    # Process Sl
    sl_manifest_path = os.path.join("sl", "manifest.json")
    if os.path.exists(sl_manifest_path):
        with open(sl_manifest_path, "r") as f:
            sl_manifest = json.load(f)
        
        sl_counts = {
            "Zigbee_Router": count_sl_files(sl_manifest, "zb_router"),
            "Zigbee_NCP": count_sl_files(sl_manifest, "zigbee_ncp"),
            "OpenThread": count_sl_files(sl_manifest, "openthread_rcp"),
            "Multi_PAN": count_sl_files(sl_manifest, "multipan")
        }
        sl_repos = get_sl_repos()
        content = update_section(content, "💚 Sl", sl_counts, sl_repos, "Indexed from:")
        print(f"Sl Counts: {sl_counts}")

    with open(readme_path, "w") as f:
        f.write(content)
    
    print("README.md updated successfully.")

if __name__ == "__main__":
    update_readme()
