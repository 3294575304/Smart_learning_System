import OpenOfficeExtractor from "word-extractor/lib/open-office-extractor.js";
import BufferReader from "word-extractor/lib/buffer-reader.js";

// word-extractor 将 Buffer 分块直接交给 XML 解析器，会截断跨块 UTF-8 中文。
// 在流边界解码，保留完整字符；不修改依赖包或旧 DOC 解析路径。
class Utf8OpenOfficeExtractor extends OpenOfficeExtractor {
  override async openArchive(reader: BufferReader) {
    const archive = await super.openArchive(reader);
    const open = archive.openReadStream.bind(archive);
    archive.openReadStream = (entry, callback) => {
      if (entry.uncompressedSize > 32 * 1024 * 1024) {
        callback(new Error("Word XML entry exceeds size limit"));
        return;
      }
      open(entry, (error, stream) => {
        if (stream) stream.setEncoding("utf8");
        callback(error, stream);
      });
    };
    return archive;
  }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const reader = new BufferReader(buffer);
  await reader.open();
  try {
    const result = await new Utf8OpenOfficeExtractor().extract(reader);
    return result.getBody();
  } finally {
    await reader.close();
  }
}
