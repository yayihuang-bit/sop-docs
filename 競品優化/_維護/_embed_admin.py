import glob, base64, os, re, sys

script_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(script_dir)
source_path = os.path.join(script_dir, "管理者指南_source.html")
output_path = os.path.join(root_dir, "管理者指南.html")

with open(source_path, "r", encoding="utf-8") as f:
    content = f.read()

mime_map = {"png":"image/png","jpg":"image/jpeg","jpeg":"image/jpeg","gif":"image/gif","webp":"image/webp","mp4":"video/mp4"}

def embed_file(rel_path, full_path):
    ext = os.path.splitext(full_path)[1][1:].lower()
    mime = mime_map.get(ext, "application/octet-stream")
    with open(full_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"

replaced = 0
failed = []

pattern = r'src="((?!https?://|data:)[^"]+\.(png|jpg|jpeg|gif|webp|mp4))"'
matches = list(re.finditer(pattern, content, re.IGNORECASE))

for m in reversed(matches):
    rel = m.group(1)
    full = os.path.join(root_dir, rel.replace("/", os.sep))
    if os.path.exists(full):
        data_uri = embed_file(rel, full)
        content = content[:m.start(1)] + data_uri + content[m.end(1):]
        replaced += 1
    else:
        failed.append(rel)

with open(output_path, "w", encoding="utf-8") as f:
    f.write(content)

size = os.path.getsize(output_path) / 1024 / 1024
print(f"完成！嵌入 {replaced} 個檔案，管理者指南.html 已輸出（{size:.1f} MB）")
if failed:
    print(f"找不到的檔案：{failed}")
