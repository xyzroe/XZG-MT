import json
import os
import re
import requests
import sys

# Пути к файлам
TASK_FILE = 'sl/task.json'
MANIFEST_FILE = 'sl/manifest.json'

# Заголовки для GitHub API (GitHub требует User-Agent)
HEADERS = {
    'User-Agent': 'Firmware-Manifest-Generator'
}

def get_github_api_url(web_url):
    """Преобразует URL веб-интерфейса GitHub в URL API."""
    # Пример: https://github.com/user/repo/tree/branch/path
    # API: https://api.github.com/repos/user/repo/contents/path?ref=branch
    
    pattern = r"github\.com/([^/]+)/([^/]+)/tree/([^/]+)/?(.*)"
    match = re.search(pattern, web_url)
    
    if match:
        owner, repo, branch, path = match.groups()
        api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        return api_url
    return None

def extract_version(filename):
    """Пытается найти версию в имени файла (например, 6.7.10)."""
    # Ищем паттерны вида v1.2.3 или 6.7.10
    match = re.search(r"(\d+\.\d+\.\d+(\.\d+)?)", filename)
    if match:
        return match.group(1)
    return "0.0.0" # Если версия не найдена

def extract_baud(filename):
    """Пытается найти скорость (baud rate) в имени файла."""
    match = re.search(r"(115200|230400|460800)", filename)
    if match:
        return match.group(1)
    return "115200"

def fetch_files_from_github(folder_url):
    """Получает список файлов из папки GitHub."""
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

def main():
    # 1. Чтение task.json
    try:
        with open(TASK_FILE, 'r', encoding='utf-8') as f:
            task_data = json.load(f)
    except FileNotFoundError:
        print(f"File {TASK_FILE} not found.")
        return

    manifest = {}

    # 2. Обход структуры task.json
    # Структура: Chip -> Board -> List of Configs
    for chip_family, boards in task_data.items():
        for board_name, config_list in boards.items():
            
            # config_list это массив настроек
            for config in config_list:
                
                # Определяем базовую папку и настройки, если они общие
                base_folder = config.get('folder')
                base_signed = config.get('signed')

                # Итерируемся по типам прошивок (zigbee_ncp, zb_router, multipan, etc.)
                # Исключаем ключи 'folder' и 'signed', так как это метаданные
                fw_types = [k for k in config.keys() if k not in ['folder', 'signed']]

                for fw_type in fw_types:
                    fw_config = config[fw_type]
                    
                    # Определяем конкретную папку и статус подписи
                    # Если внутри типа есть 'folder', используем её, иначе базовую
                    target_folder = fw_config.get('folder', base_folder)
                    is_signed = fw_config.get('signed', base_signed)
                    mask = fw_config.get('mask') # Маска для фильтрации (например "ncp-uart")

                    if not target_folder:
                        continue

                    # Получаем список файлов
                    files = fetch_files_from_github(target_folder)

                    for file_info in files:
                        filename = file_info['name']
                        download_url = file_info['download_url']

                        # Пропускаем, если это не файл (например, папка)
                        if file_info['type'] != 'file':
                            continue
                        
                        # Фильтрация по расширению (обычно .gbl или .s37)
                        if not (filename.endswith('.gbl') or filename.endswith('.s37') or filename.endswith('.ota')):
                            continue

                        # Фильтрация по маске (если задана)
                        if mask and mask not in filename:
                            continue

                        # 3. Формирование структуры Manifest
                        # Структура: fw_type -> chip -> board -> filename -> details
                        
                        if fw_type not in manifest:
                            manifest[fw_type] = {}
                        if chip_family not in manifest[fw_type]:
                            manifest[fw_type][chip_family] = {}
                        if board_name not in manifest[fw_type][chip_family]:
                            manifest[fw_type][chip_family][board_name] = {}

                        # Данные файла
                        file_entry = {
                            "ver": extract_version(filename),
                            "link": download_url,
                            "baud": extract_baud(filename),
                            "signed": is_signed if is_signed is not None else False
                        }

                        manifest[fw_type][chip_family][board_name][filename] = file_entry

    # 4. Сохранение manifest.json
    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully generated {MANIFEST_FILE}")

if __name__ == "__main__":
    main()