import json
import os
import re
import requests
import sys
from urllib.parse import urljoin, urlparse

# File paths
TASK_FILE = 'sl/task.json'
MANIFEST_FILE = 'sl/manifest.json'
SL_DIR = 'sl'

# GitHub repository info for generating raw URLs
GITHUB_REPO = 'xyzroe/XZG-MT'
GITHUB_BRANCH = 'fw_files'

# Headers for GitHub API (GitHub requires User-Agent)
HEADERS = {
    'User-Agent': 'Firmware-Manifest-Generator'
}

def get_github_api_url(web_url):
    """Converts GitHub web interface URL to API URL."""
    # Example: https://github.com/user/repo/tree/branch/path
    # API: https://api.github.com/repos/user/repo/contents/path?ref=branch
    
    pattern = r"github\.com/([^/]+)/([^/]+)/tree/([^/]+)/?(.*)"
    match = re.search(pattern, web_url)
    
    if match:
        owner, repo, branch, path = match.groups()
        api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        return api_url
    return None

def extract_version(filename):
    """Attempts to find version in filename (e.g., 6.7.10)."""
    # Search for patterns like v1.2.3 or 6.7.10
    match = re.search(r"(\d+\.\d+\.\d+(\.\d+)?)", filename)
    if match:
        return match.group(1)
    return "0.0.0" # If version not found

def extract_baud(filename):
    """Attempts to find baud rate in filename."""
    match = re.search(r"(115200|230400|460800)", filename)
    if match:
        return match.group(1)
    return "115200"

def fetch_files_from_github(folder_url):
    """Fetches list of files from GitHub folder."""
    api_url = get_github_api_url(folder_url)
    if not api_url:
        print(f"Error: Could not parse URL {folder_url}")
        return []

    print(f"Fetching: {api_url}")
    try:
        response = requests.get(api_url, headers=HEADERS)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching {api_url}: {e}")
        return []

def fetch_json_firmware_list(json_url):
    """Fetches firmware list from JSON file (e.g., Sonoff)."""
    print(f"Fetching JSON firmware list: {json_url}")
    try:
        response = requests.get(json_url, headers=HEADERS)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching {json_url}: {e}")
        return None

def get_download_url_from_json(json_url, filename):
    """Forms download URL for file based on JSON URL."""
    # Get base URL (directory where JSON is located)
    parsed = urlparse(json_url)
    base_path = '/'.join(parsed.path.split('/')[:-1])
    base_url = f"{parsed.scheme}://{parsed.netloc}{base_path}"
    return f"{base_url}/{filename}"

def download_file(url, local_path):
    """Downloads a file from URL to local path."""
    try:
        response = requests.get(url, headers=HEADERS, stream=True)
        response.raise_for_status()
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"Downloaded: {local_path}")
        return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def get_local_raw_url(local_path):
    """Generates raw GitHub URL for a local file path."""
    # Convert local path like 'sl/zigbee_ncp/file.gbl' to raw GitHub URL
    return f"https://raw.githubusercontent.com/{GITHUB_REPO}/{GITHUB_BRANCH}/{local_path}"

def sanitize_folder_name(name):
    """Sanitizes folder name by replacing invalid characters."""
    # Replace characters that are invalid in folder names
    return re.sub(r'[<>:"/\\|?*]', '_', name).strip()

def process_json_firmware_config(config, chip_family, board_name, manifest):
    """Processes configuration with JSON firmware source (e.g., Sonoff)."""
    json_url = config.get('json')
    dongle_type = config.get('dongleType')
    is_signed = config.get('signed', False)
    
    if not json_url or not dongle_type:
        return
    
    # Get JSON with firmware
    json_data = fetch_json_firmware_list(json_url)
    if not json_data or 'firmwareList' not in json_data:
        print(f"Error: Invalid JSON structure from {json_url}")
        return
    
    firmware_list = json_data['firmwareList']
    
    # Filter by dongleType
    filtered_firmware = [fw for fw in firmware_list if fw.get('dongleType') == dongle_type]
    
    # Mapping of firmware types from task.json to firmwareType from JSON
    # Example: zigbee_ncp -> "Zigbee", multipan -> "MultiPAN"
    fw_type_mapping = {}
    for key in config.keys():
        if key not in ['json', 'dongleType', 'signed']:
            fw_config = config[key]
            if isinstance(fw_config, dict) and 'firmwareType' in fw_config:
                fw_type_mapping[fw_config['firmwareType']] = key
    
    # Process each firmware
    for fw in filtered_firmware:
        json_fw_type = fw.get('firmwareType')
        if json_fw_type not in fw_type_mapping:
            continue
        
        fw_type = fw_type_mapping[json_fw_type]
        filename = fw.get('name')
        version = fw.get('version', '0.0.0')
        baud_rate = fw.get('baudRate', '115200')
        
        # Form remote download URL
        remote_url = get_download_url_from_json(json_url, filename)
        
        # Create local path: sl/<fw_type>/<sanitized_board_name>/<filename>
        sanitized_board = sanitize_folder_name(board_name)
        local_dir = os.path.join(SL_DIR, fw_type, sanitized_board)
        local_path = os.path.join(local_dir, filename)
        
        # Download file
        if download_file(remote_url, local_path):
            # Generate raw GitHub URL for the local file
            download_url = get_local_raw_url(local_path)
        else:
            # If download fails, skip this file
            continue
        
        # Add to manifest
        if fw_type not in manifest:
            manifest[fw_type] = {}
        if chip_family not in manifest[fw_type]:
            manifest[fw_type][chip_family] = {}
        if board_name not in manifest[fw_type][chip_family]:
            manifest[fw_type][chip_family][board_name] = {}
        
        file_entry = {
            "ver": version,
            "link": download_url,
            "baud": baud_rate,
            "signed": is_signed
        }
        
        manifest[fw_type][chip_family][board_name][filename] = file_entry

def main():
    # 1. Read task.json
    try:
        with open(TASK_FILE, 'r', encoding='utf-8') as f:
            task_data = json.load(f)
    except FileNotFoundError:
        print(f"File {TASK_FILE} not found.")
        return

    manifest = {}

    # 2. Traverse task.json structure
    # Structure: Chip -> Board -> List of Configs
    for chip_family, boards in task_data.items():
        for board_name, config_list in boards.items():
            
            # config_list is an array of configurations
            for config in config_list:
                
                # Check if this is a JSON configuration (e.g., Sonoff)
                if 'json' in config:
                    process_json_firmware_config(config, chip_family, board_name, manifest)
                    continue
                
                # Determine base folder and settings if they are common
                base_folder = config.get('folder')
                base_signed = config.get('signed')

                # Iterate over firmware types (zigbee_ncp, zb_router, multipan, etc.)
                # Exclude 'folder' and 'signed' keys as they are metadata
                fw_types = [k for k in config.keys() if k not in ['folder', 'signed']]

                for fw_type in fw_types:
                    fw_config = config[fw_type]
                    
                    # Determine specific folder and signature status
                    # If 'folder' exists within the type, use it, otherwise use base
                    target_folder = fw_config.get('folder', base_folder)
                    is_signed = fw_config.get('signed', base_signed)
                    mask = fw_config.get('mask') # Mask for filtering (e.g., "ncp-uart")

                    if not target_folder:
                        continue

                    # Get list of files
                    files = fetch_files_from_github(target_folder)

                    for file_info in files:
                        filename = file_info['name']
                        download_url = file_info['download_url']

                        # Skip if not a file (e.g., folder)
                        if file_info['type'] != 'file':
                            continue
                        
                        # Filter by extension (usually .gbl or .s37)
                        if not (filename.endswith('.gbl') or filename.endswith('.s37') or filename.endswith('.ota')):
                            continue

                        # Filter by mask (if specified)
                        if mask and mask not in filename:
                            continue

                        # 3. Form Manifest structure
                        # Structure: fw_type -> chip -> board -> filename -> details
                        
                        if fw_type not in manifest:
                            manifest[fw_type] = {}
                        if chip_family not in manifest[fw_type]:
                            manifest[fw_type][chip_family] = {}
                        if board_name not in manifest[fw_type][chip_family]:
                            manifest[fw_type][chip_family][board_name] = {}

                        # File data
                        file_entry = {
                            "ver": extract_version(filename),
                            "link": download_url,
                            "baud": extract_baud(filename),
                            "signed": is_signed if is_signed is not None else False
                        }

                        manifest[fw_type][chip_family][board_name][filename] = file_entry

    # 4. Save manifest.json
    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully generated {MANIFEST_FILE}")

if __name__ == "__main__":
    main()