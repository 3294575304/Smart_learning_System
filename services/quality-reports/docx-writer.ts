import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { QualityReportStatistics } from "@/services/quality-reports/calculation";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

const execFileAsync = promisify(execFile);

export interface QualityReportNarrative {
  gradeComposition: string;
  gradeAnalysis: string;
  outcomeAnalysis: string;
  studentEvaluation: string;
  summary: string;
}

function script(): string {
  return String.raw`
import json,sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.shared import Pt,Inches
from PIL import Image,ImageDraw,ImageFont
import os

payload=json.load(open(sys.argv[1],encoding='utf-8'))
doc=Document(sys.argv[2])

def chart_font(size=24):
    for candidate in [r'C:\Windows\Fonts\msyh.ttc',r'C:\Windows\Fonts\simsun.ttc']:
        if os.path.exists(candidate): return ImageFont.truetype(candidate,size)
    return ImageFont.load_default()

def bar_chart(items,title,out_path,percent=False):
    w,h=1100,520; image=Image.new('RGB',(w,h),'white'); draw=ImageDraw.Draw(image)
    draw.text((40,18),title,fill='#1f2937',font=chart_font(30))
    left,top,right,bottom=100,90,1040,440
    draw.line((left,bottom,right,bottom),fill='#64748b',width=2)
    maximum=max([x[1] for x in items]+[1]); gap=(right-left)/len(items)
    for index,(label,value) in enumerate(items):
        x0=left+index*gap+gap*.18; x1=left+(index+1)*gap-gap*.18
        y=bottom-(value/maximum)*(bottom-top)
        draw.rounded_rectangle((x0,y,x1,bottom),radius=8,fill='#2563eb')
        shown=f'{value*100:.1f}%' if percent else str(value)
        draw.text((x0,y-34),shown,fill='#0f172a',font=chart_font(20))
        draw.text((x0,bottom+12),label,fill='#334155',font=chart_font(18))
    image.save(out_path)

def set_cell(cell,text,bold=False,center=False,size=10.5):
    cell.text=''
    p=cell.paragraphs[0]
    if center: p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
    r=p.add_run(str(text))
    r.bold=bold; r.font.name='宋体'; r.font.size=Pt(size)

course=payload['source']['course']; classroom=payload['source']['classroom']
stats=payload['statistics']; narrative=payload['narrative']
set_cell(doc.tables[0].cell(0,0),course['name'],True,True,18)
set_cell(doc.tables[3].cell(0,0),course['teacherName'],True,True,18)
t=doc.tables[4]
set_cell(t.cell(0,1),course['name'],False,True); set_cell(t.cell(0,4),course['courseNature'],False,True)
set_cell(t.cell(1,1),course['term'],False,True); set_cell(t.cell(1,4),course['credits'],False,True)
set_cell(t.cell(2,2),course['majorClass'] or classroom['name'],False,True); set_cell(t.cell(2,4),len(payload['source']['students']),False,True)
set_cell(t.cell(3,2),course['teacherName'],False,True)

objectives='\n'.join([f"课程目标{o['code']}：{o['title']}" for o in payload['source']['outcomes']]) or '当前数据源未提供正式课程目标。'
main=doc.tables[5]
set_cell(main.cell(1,0),objectives)
dist='；'.join([f"{x['label']}分：{x['count']}人（{x['ratio']*100:.1f}%）" for x in stats['distribution']])
set_cell(main.cell(3,0),f"1. {narrative['gradeComposition']}\n2. {narrative['gradeAnalysis']}\n3. 总评成绩分布：{dist}")
dist_path=os.path.join(os.path.dirname(sys.argv[3]),'grade-distribution.png')
bar_chart([(x['label'],x['count']) for x in stats['distribution']],'总评成绩分布',dist_path)
main.cell(3,0).add_paragraph().add_run().add_picture(dist_path,width=Inches(5.8))
outcomes='\n'.join([f"{x['code']}  达成度：{x['attainmentIndex'] if x['attainmentIndex'] is not None else '未提供'}  阈值：{x['threshold']}" for x in stats['outcomes']]) or '当前数据源未提供课程目标达成度。'
set_cell(main.cell(5,0),f"定量分析：\n{outcomes}\n\n定性分析：\n{narrative['outcomeAnalysis']}")
if stats['outcomes']:
    outcome_path=os.path.join(os.path.dirname(sys.argv[3]),'outcome-attainment.png')
    bar_chart([(x['code'],x['attainmentIndex'] or 0) for x in stats['outcomes']],'课程目标达成度',outcome_path,True)
    main.cell(5,0).add_paragraph().add_run().add_picture(outcome_path,width=Inches(5.8))

evaluation=doc.tables[6]
set_cell(evaluation.cell(1,0),narrative['studentEvaluation'])
set_cell(evaluation.cell(5,0),narrative['summary'])

# 审核意见、签字与日期必须留空。
audit=doc.tables[7]
for row in (1,3): set_cell(audit.cell(row,0),'')
doc.core_properties.title=f"{course['name']}课程教学质量分析报告"
doc.core_properties.comments='由智学课堂生成；审核意见、签字和日期留空。'
doc.save(sys.argv[3])
`;
}

function pythonCandidates(): string[] {
  return [
    process.env.QUALITY_REPORT_PYTHON?.trim() ?? "",
    path.join(
      process.env.USERPROFILE ?? "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe",
    ),
    "python",
  ].filter(Boolean);
}

export async function buildQualityReportDocx(
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  narrative: QualityReportNarrative,
): Promise<Buffer> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "quality-report-"));
  const payloadPath = path.join(temp, "payload.json");
  const scriptPath = path.join(temp, "generate.py");
  const outputPath = path.join(temp, "report.docx");
  const templatePath = path.join(
    process.cwd(),
    "assets",
    "report-templates",
    "quality-report-2024.docx",
  );
  try {
    await fs.writeFile(
      payloadPath,
      JSON.stringify({ source, statistics, narrative }),
      "utf8",
    );
    await fs.writeFile(scriptPath, script(), "utf8");
    let lastError: unknown = null;
    for (const python of pythonCandidates()) {
      try {
        await execFileAsync(
          python,
          [scriptPath, payloadPath, templatePath, outputPath],
          {
            timeout: 30_000,
            windowsHide: true,
          },
        );
        return await fs.readFile(outputPath);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
