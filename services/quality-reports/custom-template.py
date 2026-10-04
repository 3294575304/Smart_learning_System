"""Bounded DOCX inspection and surgical filling; preserve untouched package parts."""
import json
import re
import sys
import zipfile
from copy import deepcopy
from lxml import etree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
TOKEN = re.compile(r"\{\{\s*([^{}\r\n]{1,100}?)\s*\}\}")


def load(path):
    archive = zipfile.ZipFile(path)
    infos = archive.infolist()
    if len(infos) > 2000 or sum(i.file_size for i in infos) > 32 * 1024 * 1024:
        raise ValueError("模板解压后过大")
    names = [i.filename for i in infos]
    if len(set(names)) != len(names) or not {"[Content_Types].xml", "word/document.xml"}.issubset(names):
        raise ValueError("不是有效的 DOCX 模板")
    parts = {}
    roots = {}
    for info in infos:
        name = info.filename
        if info.flag_bits & 1 or ".." in name.split("/") or name.startswith(("/", "\\")) or "\\" in name:
            raise ValueError("模板包含不安全的压缩条目")
        if any(s in name.lower() for s in ("vbaproject", "embeddings/", "activex/")):
            raise ValueError("模板不能包含宏、嵌入对象或控件")
        if info.file_size > 10 * 1024 * 1024:
            raise ValueError("模板内部文件过大")
        data = archive.read(info)
        parts[name] = data
        if name.endswith((".xml", ".rels")):
            if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
                raise ValueError("模板包含不安全的 XML 声明")
            root = etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True))
            if name.endswith(".rels") and any(e.get("TargetMode") == "External" for e in root):
                raise ValueError("请移除模板中的外部链接或外部图片后上传")
            if name == "word/document.xml" or re.fullmatch(r"word/(header|footer)\d+\.xml", name):
                if root.findall(".//" + W + "altChunk"):
                    raise ValueError("不支持外部内容块")
                roots[name] = root
    if roots["word/document.xml"].tag != W + "document":
        raise ValueError("缺少 Word 正文")
    return parts, roots


def text(element):
    return "".join(t.text or "" for t in element.iter(W + "t"))


def discover(roots):
    slots, targets = [], {}
    for name, root in roots.items():
        for pi, paragraph in enumerate(root.iter(W + "p")):
            for ti, match in enumerate(TOKEN.finditer(text(paragraph))):
                key = f"{name}:p{pi}:t{ti}"
                slots.append({"id": key, "label": match.group(1).strip(), "kind": "TOKEN"})
                targets[key] = (paragraph, match.start(), match.end())
        for ci, cell in enumerate(root.iter(W + "tc")):
            # Only empty leaf cells: nested tables and signature labels remain untouched.
            if text(cell).strip() or cell.find(".//" + W + "tbl") is not None:
                continue
            siblings = list(cell.getparent())
            index = siblings.index(cell)
            label = text(siblings[index - 1]).strip() if index else ""
            key = f"{name}:c{ci}"
            slots.append({"id": key, "label": (label[:250] or "空白表格单元格") + f"（位置 {ci + 1}）", "kind": "CELL"})
            targets[key] = cell
    if not slots or len(slots) > 200:
        raise ValueError("模板需包含 1 至 200 个 {{字段名}} 占位符或空白表格单元格")
    return slots, targets


def replace_span(paragraph, start, end, replacement):
    offset = 0
    for node in list(paragraph.iter(W + "t")):
        value = node.text or ""
        stop = offset + len(value)
        if stop > start and offset < end:
            left, right = max(0, start - offset), min(len(value), end - offset)
            insert = replacement if offset <= start < stop else ""
            node.text = value[:left] + insert + value[right:]
            node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        offset = stop


def line_breaks(root):
    for node in list(root.iter(W + "t")):
        if "\n" not in (node.text or ""):
            continue
        pieces = node.text.split("\n")
        node.text = pieces[0]
        parent, previous = node.getparent(), node
        for piece in pieces[1:]:
            br, new = etree.Element(W + "br"), deepcopy(node)
            new.text = piece
            parent.insert(parent.index(previous) + 1, br)
            parent.insert(parent.index(br) + 1, new)
            previous = new


def run():
    mode, input_path, output_path = sys.argv[1:4]
    parts, roots = load(input_path)
    slots, targets = discover(roots)
    if mode == "inspect":
        with open(output_path, "w", encoding="utf-8") as output:
            json.dump({"slots": slots}, output, ensure_ascii=False)
        return
    with open(sys.argv[4], encoding="utf-8") as source:
        payload = json.load(source)
    fields, mappings = payload["fields"], payload["mappings"]
    seen = set()
    for mapping in mappings:
        key, field = mapping["slotId"], mapping["field"]
        if key not in targets or key in seen or (field != "BLANK" and field not in fields):
            raise ValueError("模板字段映射无效")
        seen.add(key)
    if any(s["kind"] == "TOKEN" and s["id"] not in seen for s in slots):
        raise ValueError("模板占位符尚未全部确认")
    # Reverse token offsets so multiple replacements in one paragraph stay stable.
    ordered = sorted(mappings, key=lambda m: targets[m["slotId"]][1] if isinstance(targets[m["slotId"]], tuple) else -1, reverse=True)
    for mapping in ordered:
        target = targets[mapping["slotId"]]
        value = "" if mapping["field"] == "BLANK" else str(fields[mapping["field"]])
        if isinstance(target, tuple):
            replace_span(*target, value)
        elif value:
            paragraph = target.find(W + "p")
            if paragraph is None:
                paragraph = etree.SubElement(target, W + "p")
            run_node = etree.SubElement(paragraph, W + "r")
            node = etree.SubElement(run_node, W + "t")
            node.text = value
    for name, root in roots.items():
        line_breaks(root)
        parts[name] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as result:
        for name, data in parts.items():
            result.writestr(name, data)


if __name__ == "__main__":
    run()
