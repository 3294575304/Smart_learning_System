import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { zipSync } from "fflate";
import { validateSubmissionAttachment } from "@/services/assignments/attachments";

function binaryWordFixture(): Buffer {
  const sectorSize = 512;
  const data = Buffer.alloc(11 * sectorSize);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(data);
  data.writeUInt16LE(9, 30);
  data.writeInt32LE(1, 48);
  data.fill(0xff, 76, sectorSize);
  data.writeInt32LE(0, 76);
  const fat = data.subarray(sectorSize, 2 * sectorSize);
  fat.fill(0xff);
  fat.writeInt32LE(-3, 0);
  fat.writeInt32LE(-2, 4);
  for (let sector = 2; sector < 9; sector += 1) {
    fat.writeInt32LE(sector + 1, sector * 4);
  }
  fat.writeInt32LE(-2, 9 * 4);
  const directory = data.subarray(2 * sectorSize, 3 * sectorSize);
  const name = Buffer.from("WordDocument\0", "utf16le");
  name.copy(directory);
  directory.writeUInt16LE(name.length, 64);
  directory.writeUInt8(2, 66);
  directory.writeInt32LE(2, 116);
  directory.writeUInt32LE(4096, 120);
  data.writeUInt16LE(0xa5ec, 3 * sectorSize);
  return data;
}

test("作业附件接受二进制 DOC、DOCX 和 UTF-8 TXT", async () => {
  const docx = await readFile(
    new URL(
      "../questions/fixtures/chinese-stream-boundary.docx",
      import.meta.url,
    ),
  );
  assert.equal(
    await validateSubmissionAttachment(binaryWordFixture(), {
      name: "作答.DOC",
      type: "application/octet-stream",
    }),
    "application/msword",
  );
  assert.equal(
    await validateSubmissionAttachment(docx, { name: "作答.docx", type: "" }),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.equal(
    await validateSubmissionAttachment(Buffer.from("作答内容"), {
      name: "作答.txt",
      type: "text/plain",
    }),
    "text/plain",
  );
});

test("作业附件拒绝伪装文档、冲突的媒体类型和超限文件", async () => {
  const brokenDoc = binaryWordFixture();
  brokenDoc.writeInt32LE(2, 512 + 9 * 4);
  await assert.rejects(
    validateSubmissionAttachment(brokenDoc, { name: "坏文件.doc", type: "" }),
    /Word 文件无法读取/,
  );
  const zip = Buffer.from(zipSync({ "file.txt": Buffer.from("作答") }));
  await assert.rejects(
    validateSubmissionAttachment(zip, { name: "伪装.docx", type: "" }),
    /Word 文件无法读取/,
  );
  await assert.rejects(
    validateSubmissionAttachment(Buffer.from("作答"), {
      name: "作答.txt",
      type: "application/pdf",
    }),
    /附件类型与扩展名不匹配/,
  );
  await assert.rejects(
    validateSubmissionAttachment(Buffer.alloc(5 * 1024 * 1024 + 1), {
      name: "超限.doc",
      type: "",
    }),
    /5 MB/,
  );
});
