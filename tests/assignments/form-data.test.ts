import assert from "node:assert/strict";
import test from "node:test";
import { readAssignmentFormData } from "../../services/assignments/form-data";

test("上传读取正常 multipart，拒绝畸形内容和声明超限", async () => {
  const form = new FormData();
  form.set("file", new File(["print(1)"], "test.py"));
  const result = await readAssignmentFormData(
    new Request("http://localhost", { method: "POST", body: form }),
  );
  assert.equal((result.get("file") as File).name, "test.py");
  await assert.rejects(
    readAssignmentFormData(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-length": "100" },
        body: "bad",
      }),
      10,
    ),
    { status: 413 },
  );
  await assert.rejects(
    readAssignmentFormData(
      new Request("http://localhost", { method: "POST", body: "bad" }),
    ),
    { status: 400 },
  );
});

test("无长度及伪造长度的分块上传按实际字节拒绝并停止读取", async () => {
  for (const length of [null, "1"]) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      headers: length ? { "content-length": length } : {},
      duplex: "half",
    } as RequestInit);
    await assert.rejects(readAssignmentFormData(request, 10), { status: 413 });
    assert.equal(cancelled, true);
  }
});
