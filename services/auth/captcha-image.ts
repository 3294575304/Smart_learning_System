import { randomInt } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";

const ALPHABET = "2346789ACDEFGHJKMNPQRTUVWXY";

export function generateCaptchaAnswer(): string {
  return Array.from(
    { length: 5 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
}

export function renderCaptchaImage(answer: string): string {
  const canvas = createCanvas(176, 64);
  const context = canvas.getContext("2d");
  context.fillStyle = "#eef7f5";
  context.fillRect(0, 0, 176, 64);

  for (let i = 0; i < 45; i += 1) {
    context.fillStyle = i % 2 ? "#b5dcd4" : "#d3b9ae";
    context.beginPath();
    context.arc(randomInt(176), randomInt(64), randomInt(1, 3), 0, Math.PI * 2);
    context.fill();
  }
  Array.from(answer).forEach((character, index) => {
    context.save();
    context.translate(23 + index * 32, 40 + randomInt(-5, 6));
    context.rotate((randomInt(-18, 19) * Math.PI) / 180);
    context.font = "bold 32px sans-serif";
    context.textAlign = "center";
    context.fillStyle = ["#276c70", "#314f64", "#a84b51"][index % 3];
    context.fillText(character, 0, 0);
    context.restore();
  });
  for (let i = 0; i < 3; i += 1) {
    context.strokeStyle = "#6eaaa88a";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, randomInt(64));
    context.bezierCurveTo(
      50,
      randomInt(64),
      110,
      randomInt(64),
      176,
      randomInt(64),
    );
    context.stroke();
  }
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}
