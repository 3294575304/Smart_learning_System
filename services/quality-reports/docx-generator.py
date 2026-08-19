import json
import math
import os
import re
import sys
import zipfile

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont


payload = json.load(open(sys.argv[1], encoding="utf-8"))
template_path = sys.argv[2]
output_path = sys.argv[3]
work_dir = os.path.dirname(output_path)
doc = Document(template_path)
source = payload["source"]
course = source["course"]
classroom = source["classroom"]
statistics = payload["statistics"]
narrative = payload["narrative"]
reviewed = bool(payload.get("reviewed", False))


def font_path():
    candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simsun.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    return next((path for path in candidates if os.path.exists(path)), None)


def chart_font(size, bold=False):
    candidates = (
        [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\simhei.ttf"]
        if bold
        else []
    )
    path = next((item for item in candidates if os.path.exists(item)), None) or font_path()
    return ImageFont.truetype(path, size) if path else ImageFont.load_default()


def apply_run_font(run, size=10.5, bold=False, color=None, name="宋体"):
    run.font.name = name
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), name)


def format_paragraph(paragraph, center=False, before=0, after=0, line=1.5):
    if center:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.line_spacing = line


def clear_cell(cell):
    cell.text = ""
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    return cell.paragraphs[0]


def set_cell(cell, text, bold=False, center=False, size=10.5):
    paragraph = clear_cell(cell)
    format_paragraph(paragraph, center=center, line=1.2)
    run = paragraph.add_run(str(text))
    apply_run_font(run, size=size, bold=bold)
    return paragraph


def add_text(paragraph, text, bold=False, size=10.5, color=None):
    run = paragraph.add_run(text)
    apply_run_font(run, size=size, bold=bold, color=color)
    return run


def shade_cell(cell, fill):
    properties = cell._tc.get_or_add_tcPr()
    shading = properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        properties.append(shading)
    shading.set(qn("w:fill"), fill)


def repeat_header(row):
    properties = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    properties.append(header)


def dont_split(row):
    properties = row._tr.get_or_add_trPr()
    properties.append(OxmlElement("w:cantSplit"))


def style_table(table, header_rows=1, body_size=8.5):
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for row_index, row in enumerate(table.rows):
        dont_split(row)
        if row_index < header_rows:
            repeat_header(row)
        for cell in row.cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if row_index < header_rows:
                shade_cell(cell, "EAF2F8")
            for paragraph in cell.paragraphs:
                format_paragraph(paragraph, center=True, line=1.0)
                for run in paragraph.runs:
                    apply_run_font(
                        run,
                        size=body_size,
                        bold=row_index < header_rows,
                    )


def chart_canvas(title):
    width, height = 1100, 520
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((width / 2, 20), title, anchor="ma", fill="#111827", font=chart_font(30, True))
    return image, draw, width, height


def bar_chart(items, title, output, percent=False):
    image, draw, width, height = chart_canvas(title)
    left, top, right, bottom = 110, 95, width - 55, height - 80
    maximum = max([float(value) for _, value in items] + [1.0])
    for tick in range(5):
        y = bottom - (bottom - top) * tick / 4
        draw.line((left, y, right, y), fill="#D1D5DB", width=1)
    draw.line((left, bottom, right, bottom), fill="#4B5563", width=2)
    gap = (right - left) / max(len(items), 1)
    for index, (label, raw_value) in enumerate(items):
        value = float(raw_value)
        x0 = left + index * gap + gap * 0.2
        x1 = left + (index + 1) * gap - gap * 0.2
        y = bottom - (value / maximum) * (bottom - top)
        draw.rounded_rectangle((x0, y, x1, bottom), radius=8, fill="#4472C4")
        shown = f"{value * 100:.1f}%" if percent else f"{value:g}"
        draw.text(((x0 + x1) / 2, y - 12), shown, anchor="ms", fill="#111827", font=chart_font(19))
        draw.text(((x0 + x1) / 2, bottom + 18), str(label), anchor="ma", fill="#374151", font=chart_font(18))
    image.save(output)


def grouped_outcome_chart(items, output):
    image, draw, width, height = chart_canvas("课程目标达成情况分析")
    left, top, right, bottom = 110, 95, width - 55, height - 80
    draw.line((left, bottom, right, bottom), fill="#4B5563", width=2)
    for tick in range(6):
        y = bottom - (bottom - top) * tick / 5
        draw.line((left, y, right, y), fill="#D1D5DB", width=1)
        draw.text((left - 12, y), f"{tick / 5:.1f}", anchor="rm", fill="#374151", font=chart_font(16))
    gap = (right - left) / max(len(items), 1)
    for index, item in enumerate(items):
        x = left + index * gap + gap * 0.23
        bar_width = gap * 0.25
        values = [(item[1], "#4472C4"), (item[2], "#ED7D31")]
        for offset, (value, color) in enumerate(values):
            normalized = max(0.0, min(1.1, float(value)))
            x0 = x + offset * bar_width
            y = bottom - normalized / 1.1 * (bottom - top)
            draw.rectangle((x0, y, x0 + bar_width - 3, bottom), fill=color)
            draw.text((x0 + bar_width / 2, y - 8), f"{normalized:.2f}", anchor="ms", fill="#111827", font=chart_font(16))
        draw.text((x + bar_width, bottom + 18), str(item[0]), anchor="ma", fill="#374151", font=chart_font(17))
    draw.rectangle((right - 260, 45, right - 240, 62), fill="#4472C4")
    draw.text((right - 230, 54), "达成度", anchor="lm", fill="#374151", font=chart_font(16))
    draw.rectangle((right - 130, 45, right - 110, 62), fill="#ED7D31")
    draw.text((right - 100, 54), "期望值", anchor="lm", fill="#374151", font=chart_font(16))
    image.save(output)


def normalize_score(value):
    number = float(value)
    return number / 100 if abs(number) > 1.5 else number


def scatter_chart(code, scores, threshold, output):
    values = [normalize_score(value) for value in scores]
    expected = normalize_score(threshold)
    mean = sum(values) / len(values) if values else 0
    image, draw, width, height = chart_canvas(f"课程目标{code}达成情况分析")
    left, top, right, bottom = 100, 90, width - 55, height - 85
    for tick in range(6):
        y = bottom - (bottom - top) * tick / 5
        draw.line((left, y, right, y), fill="#D1D5DB", width=1)
        draw.text((left - 12, y), f"{tick / 5:.1f}", anchor="rm", fill="#374151", font=chart_font(16))
    draw.line((left, bottom, right, bottom), fill="#4B5563", width=2)
    for index, value in enumerate(values):
        x = left + (right - left) * (index + 1) / (len(values) + 1)
        y = bottom - max(0, min(1.05, value)) / 1.05 * (bottom - top)
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill="#6D9EEB", outline="#4472C4")
    for value, color in ((mean, "#4472C4"), (expected, "#FF0000")):
        y = bottom - max(0, min(1.05, value)) / 1.05 * (bottom - top)
        draw.line((left, y, right, y), fill=color, width=3)
    draw.text((right - 300, 52), f"平均达成度 {mean:.2f}", fill="#4472C4", font=chart_font(16))
    draw.text((right - 140, 52), f"期望值 {expected:.2f}", fill="#B91C1C", font=chart_font(16))
    image.save(output)


def add_picture(cell, path, width=5.5):
    paragraph = cell.add_paragraph()
    format_paragraph(paragraph, center=True, line=1.0)
    paragraph.add_run().add_picture(path, width=Inches(width))


def add_caption(cell, text):
    paragraph = cell.add_paragraph()
    format_paragraph(paragraph, center=True, line=1.0)
    add_text(paragraph, text, size=9)


def cover_field(paragraph_index, value):
    paragraph = doc.paragraphs[paragraph_index]
    if len(paragraph.runs) < 2:
        return
    paragraph.runs[1].text = f"  {value or ' '}  "


def first_year(*values):
    for value in values:
        match = re.search(r"20\d{2}", str(value or ""))
        if match:
            return match.group(0)
    return ""


def restore_template_parts(reference_path, generated_path):
    preserve_parts = {
        "_rels/.rels",
        "customXml/_rels/item1.xml.rels",
        "customXml/_rels/item2.xml.rels",
        "word/_rels/fontTable.xml.rels",
        "word/_rels/header1.xml.rels",
        "word/header1.xml",
        "word/footer1.xml",
        "word/styles.xml",
    }
    patched_path = generated_path + ".patched"
    with zipfile.ZipFile(reference_path, "r") as reference, zipfile.ZipFile(
        generated_path, "r"
    ) as generated, zipfile.ZipFile(
        patched_path, "w", compression=zipfile.ZIP_DEFLATED
    ) as patched:
        for info in generated.infolist():
            data = (
                reference.read(info.filename)
                if info.filename in preserve_parts
                else generated.read(info.filename)
            )
            patched.writestr(info, data)
    os.replace(patched_path, generated_path)


# Cover slots are edited in place so the original underlines and paragraph tabs remain.
set_cell(doc.tables[0].cell(0, 0), course["name"], bold=True, center=True, size=18)
set_cell(doc.tables[3].cell(0, 0), course["teacherName"], bold=True, center=True, size=18)
cover_field(9, course.get("college", ""))
cover_field(10, course.get("major", ""))
cover_field(11, first_year(course.get("majorClass"), course.get("term")))
cover_field(12, classroom.get("name", ""))

# Course metadata table.
metadata = doc.tables[4]
set_cell(metadata.cell(0, 1), course["name"], bold=True, center=True)
set_cell(metadata.cell(0, 4), course["courseNature"], bold=True, center=True)
set_cell(metadata.cell(1, 1), course["term"], bold=True, center=True)
set_cell(metadata.cell(1, 4), f"{course['credits']:.1f}", bold=True, center=True)
set_cell(metadata.cell(2, 2), course.get("majorClass") or classroom["name"], bold=True, center=True)
set_cell(metadata.cell(2, 4), len(source["students"]), bold=True, center=True)
set_cell(metadata.cell(3, 2), course["teacherName"], bold=True, center=True)

# Course objectives.
main = doc.tables[5]
objective_cell = main.cell(1, 0)
paragraph = clear_cell(objective_cell)
for index, outcome in enumerate(source.get("outcomes", [])):
    current = paragraph if index == 0 else objective_cell.add_paragraph()
    format_paragraph(current, line=1.5)
    add_text(current, f"课程目标{outcome['code']} ", bold=True)
    description = outcome.get("description")
    add_text(current, description or outcome["title"])
if not source.get("outcomes"):
    add_text(paragraph, "当前数据源未提供正式课程目标。")

# Grade composition, distribution table and deterministic chart.
grade_cell = main.cell(3, 0)
paragraph = clear_cell(grade_cell)
format_paragraph(paragraph, line=1.4)
add_text(paragraph, "1.课程总评成绩构成", bold=True)
add_text(paragraph, "（考核方式及所占权重，与教学大纲保持一致）")
paragraph = grade_cell.add_paragraph()
format_paragraph(paragraph, line=1.4)
add_text(paragraph, narrative["gradeComposition"])
paragraph = grade_cell.add_paragraph()
format_paragraph(paragraph, before=4, line=1.2)
add_text(paragraph, "2.总评成绩分布", bold=True)
distribution = statistics["distribution"]
table = grade_cell.add_table(rows=3, cols=len(distribution) + 1)
headers = ["分段"] + [item["label"] for item in distribution]
counts = ["人数"] + [str(item["count"]) for item in distribution]
ratios = ["比例"] + [f"{item['ratio'] * 100:.2f}%" for item in distribution]
for row, values in zip(table.rows, (headers, counts, ratios)):
    for cell, value in zip(row.cells, values):
        set_cell(cell, value, bold=values is headers, center=True, size=9)
style_table(table, header_rows=1, body_size=9)
grade_chart = os.path.join(work_dir, "grade-distribution.png")
bar_chart([(item["label"], item["count"]) for item in distribution], "总评成绩分布图", grade_chart)
add_picture(grade_cell, grade_chart, 5.5)
add_caption(
    grade_cell,
    f"图1 总评成绩分布图（总人数：{statistics['participantCount']}，平均分：{statistics['mean'] if statistics['mean'] is not None else '未提供'}）",
)
paragraph = grade_cell.add_paragraph()
format_paragraph(paragraph, before=2, line=1.5)
add_text(paragraph, narrative["gradeAnalysis"])

# Outcome table, summary chart, AI draft analysis and per-outcome evidence chart.
outcome_cell = main.cell(5, 0)
paragraph = clear_cell(outcome_cell)
format_paragraph(paragraph, line=1.3)
add_text(paragraph, "1.课程目标达成情况——定量统计", bold=True)
add_text(paragraph, "（评分标准与课程大纲保持一致）")
paragraph = outcome_cell.add_paragraph()
format_paragraph(paragraph, line=1.2)
add_text(paragraph, "注：达成度计算结果保留2位小数。", size=9)
outcomes = statistics.get("outcomes", [])
components = source.get("components", [])
if outcomes:
    outcome_table = outcome_cell.add_table(rows=len(outcomes) + 2, cols=len(components) + 4)
    header = ["课程目标"] + [item["name"] for item in components] + ["达成度", "期望值", "人数"]
    weights = ["考核权重"] + [f"{item['weight'] * 100:.1f}%" for item in components] + ["", "", ""]
    for column, value in enumerate(header):
        set_cell(outcome_table.cell(0, column), value, bold=True, center=True, size=8)
    for column, value in enumerate(weights):
        set_cell(outcome_table.cell(1, column), value, center=True, size=8)
    for row_index, outcome in enumerate(outcomes, start=2):
        allocations = {item["componentCode"]: item["allocationRate"] for item in outcome.get("componentAllocations", [])}
        values = [outcome["code"]]
        values.extend(
            f"{allocations[item['code']] * 100:.1f}%" if item["code"] in allocations else "—"
            for item in components
        )
        values.extend([
            "未提供" if outcome["attainmentIndex"] is None else f"{outcome['attainmentIndex']:.2f}",
            "未提供" if outcome["threshold"] is None else f"{outcome['threshold']:.2f}",
            str(outcome["participantCount"]),
        ])
        for column, value in enumerate(values):
            set_cell(outcome_table.cell(row_index, column), value, center=True, size=8)
    style_table(outcome_table, header_rows=1, body_size=8)
paragraph = outcome_cell.add_paragraph()
format_paragraph(paragraph, before=5, line=1.2)
add_text(paragraph, "2.课程目标达成情况——定性分析", bold=True)
chartable_outcomes = [
    outcome
    for outcome in outcomes
    if outcome.get("attainmentIndex") is not None and outcome.get("threshold") is not None
]
if chartable_outcomes:
    summary_chart = os.path.join(work_dir, "outcome-summary.png")
    grouped_outcome_chart(
        [
            (
                outcome["code"],
                outcome["attainmentIndex"],
                outcome["threshold"],
            )
            for outcome in chartable_outcomes
        ],
        summary_chart,
    )
    add_picture(outcome_cell, summary_chart, 5.5)
    add_caption(outcome_cell, "图2 课程目标达成情况分析图")
paragraph = outcome_cell.add_paragraph()
format_paragraph(paragraph, line=1.5)
add_text(paragraph, narrative["outcomeAnalysis"])
details = {item["code"]: item["analysis"] for item in narrative.get("outcomeDetails", [])}
for index, outcome in enumerate(outcomes, start=3):
    paragraph = outcome_cell.add_paragraph()
    format_paragraph(paragraph, before=4, line=1.5)
    add_text(paragraph, f"课程目标{outcome['code']}达成情况分析：", bold=True)
    add_text(paragraph, details.get(outcome["code"], "暂无分析文字。"))
    if outcome.get("studentScores") and outcome.get("threshold") is not None:
        path = os.path.join(work_dir, f"outcome-{index}.png")
        scatter_chart(outcome["code"], outcome["studentScores"], outcome["threshold"], path)
        add_picture(outcome_cell, path, 5.35)
        add_caption(outcome_cell, f"图{index} 课程目标{outcome['code']}达成情况分析图")

# Questionnaire aggregate, AI course summary and improvement measures.
evaluation = doc.tables[6]
set_cell(evaluation.cell(1, 0), narrative["studentEvaluation"], size=10.5)
summary_cell = evaluation.cell(5, 0)
paragraph = clear_cell(summary_cell)
format_paragraph(paragraph, line=1.5)
add_text(paragraph, "1.课程总结：", bold=True)
add_text(paragraph, "\n" + narrative["courseSummary"])
paragraph = summary_cell.add_paragraph()
format_paragraph(paragraph, before=4, line=1.5)
add_text(paragraph, "2.持续改进措施：", bold=True)
add_text(paragraph, "\n" + narrative["improvementMeasures"])
survey_title = source.get("survey", {}).get("title") if source.get("survey") else course["name"]
set_cell(evaluation.cell(7, 0), f"附件3.1  《{survey_title}》学生调查问卷\n……", size=10.5)

# The template's review opinions, signatures and dates are intentionally untouched.
doc.core_properties.title = f"{course['name']}课程教学质量分析报告"
doc.core_properties.comments = (
    "AI 生成分析初稿，已经授课教师审核确认；课程评价小组、学院审核意见、签字和日期留空。"
    if reviewed
    else "AI 生成分析初稿，须经授课教师审核确认后方可作为正式报告；课程评价小组、学院审核意见、签字和日期留空。"
)
settings = doc.settings._element
update_fields = settings.find(qn("w:updateFields"))
if update_fields is None:
    update_fields = OxmlElement("w:updateFields")
    settings.append(update_fields)
update_fields.set(qn("w:val"), "true")
doc.save(output_path)
restore_template_parts(template_path, output_path)
