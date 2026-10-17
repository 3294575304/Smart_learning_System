declare module "word-extractor" {
  class ExtractedWordDocument {
    getBody(): string;
  }

  class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedWordDocument>;
  }

  export = WordExtractor;
}

declare module "word-extractor/lib/buffer-reader" {
  class BufferReader {
    constructor(buffer: Buffer);
    open(): Promise<void>;
    close(): Promise<void>;
  }

  export = BufferReader;
}

declare module "word-extractor/lib/ole-compound-doc" {
  import type { Readable } from "node:stream";

  class OleCompoundDoc {
    constructor(reader: unknown);
    read(): Promise<OleCompoundDoc>;
    stream(name: string): Readable;
  }

  export = OleCompoundDoc;
}

declare module "word-extractor/lib/open-office-extractor" {
  import type { Readable } from "node:stream";
  import BufferReader from "word-extractor/lib/buffer-reader";
  interface ArchiveEntry {
    uncompressedSize: number;
  }
  interface Archive {
    openReadStream(
      entry: ArchiveEntry,
      callback: (error: Error | null, stream?: Readable) => void,
    ): void;
  }
  class OpenOfficeExtractor {
    openArchive(reader: BufferReader): Promise<Archive>;
    extract(reader: BufferReader): Promise<{ getBody(): string }>;
  }
  export = OpenOfficeExtractor;
}
