import assert from "node:assert/strict";
import test from "node:test";
import { courseSummaryCoverage } from "../../services/quality-reports/summary-coverage";
test("课程总结四项检查接受明确的数据不足说明，不以套话视为完整", () => {
  const text =
    "教学内容与授课方式需核实对课程目标的支撑。考核与大纲、课程目标和评分标准需核对。课程目标达成数据未提供。学生评价问卷不足，暂不能比较。";
  assert.equal(
    courseSummaryCoverage(text).every((item) => item.covered),
    true,
  );
  assert.equal(
    courseSummaryCoverage("整体成绩不错，继续加强练习。").some(
      (item) => item.covered,
    ),
    false,
  );
});
