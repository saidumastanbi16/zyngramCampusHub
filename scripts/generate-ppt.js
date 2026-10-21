import PptxGenJS from "pptxgenjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(projectDir, "docs");
const screenshotDir = path.join(outDir, "screenshots");
const outFile = path.join(outDir, "Campus-Hub-Presentation.pptx");
const screens = [
  { file: "01-portal-selection.png", title: "Choose a campus portal", caption: "Start by selecting the right space: Student, Trainer, Campus Coordinator, or Administration." },
  { file: "02-student-sign-in.png", title: "Student sign-in", caption: "Students enter their campus account details to access their learning workspace." },
  { file: "03-sample-access.png", title: "Explore with sample access", caption: "Development-only sample access lets people explore the prototype without a real account." },
  { file: "04-student-dashboard.png", title: "Student dashboard", caption: "The dashboard brings learning progress, attendance, tasks, and upcoming work together." }
];

function imageDimensions(filePath) {
  const header = Buffer.alloc(24);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error(`Expected a PNG screenshot: ${filePath}`);
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

async function build() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = "Zyngram Campus Hub";
  pptx.subject = "Campus Hub user journey with application screenshots";
  pptx.title = "Zyngram Campus Hub";
  pptx.theme = {
    headFontFace: "Georgia",
    bodyFontFace: "Aptos",
    lang: "en-US"
  };

  const cover = pptx.addSlide();
  cover.background = { color: "74627B" };
  cover.addText("ZYNGRAM  ·  CAMPUS HUB", {
    x: 0.8, y: 0.65, w: 6, h: 0.35, fontFace: "Aptos", fontSize: 12,
    charSpacing: 2, bold: true, color: "E9DFEA"
  });
  cover.addText("Your campus journey,\nfrom sign-in to dashboard.", {
    x: 0.8, y: 2.0, w: 9.7, h: 2.0, fontFace: "Georgia", fontSize: 34,
    breakLine: false, color: "FFFFFF", margin: 0, bold: false, valign: "mid"
  });
  cover.addText("A visual walkthrough of the Zyngram Campus Hub prototype", {
    x: 0.85, y: 4.4, w: 8.8, h: 0.55, fontFace: "Aptos", fontSize: 18, color: "E9DFEA"
  });
  cover.addText("PORTAL SELECTION  →  STUDENT SIGN-IN  →  SAMPLE ACCESS  →  DASHBOARD", {
    x: 0.85, y: 6.35, w: 11.7, h: 0.35, fontFace: "Aptos", fontSize: 10,
    charSpacing: 1.1, color: "E9DFEA"
  });

  for (const [index, screen] of screens.entries()) {
    const imgPath = path.join(screenshotDir, screen.file);
    if (!fs.existsSync(imgPath)) {
      throw new Error(`Required screenshot is missing: ${imgPath}`);
    }
    const slide = pptx.addSlide();
    slide.background = { color: "F7F6F2" };
    slide.addText(`CAMPUS HUB  ·  ${String(index + 1).padStart(2, "0")} / ${String(screens.length).padStart(2, "0")}`, {
      x: 0.55, y: 0.28, w: 6, h: 0.25, fontFace: "Aptos", fontSize: 9,
      charSpacing: 1, color: "74627B"
    });
    slide.addText(screen.title, {
      x: 0.55, y: 0.62, w: 12.2, h: 0.48, fontFace: "Georgia", fontSize: 24,
      color: "292820", margin: 0
    });
    slide.addText(screen.caption, {
      x: 0.57, y: 1.12, w: 12.2, h: 0.42, fontFace: "Aptos", fontSize: 12, color: "77756E",
      margin: 0, valign: "mid"
    });

    const { width, height } = imageDimensions(imgPath);
    const area = { x: 0.55, y: 1.75, w: 12.23, h: 5.2 };
    const scale = Math.min(area.w / width, area.h / height);
    const imageWidth = width * scale;
    const imageHeight = height * scale;
    slide.addImage({
      path: imgPath,
      x: area.x + (area.w - imageWidth) / 2,
      y: area.y + (area.h - imageHeight) / 2,
      w: imageWidth,
      h: imageHeight
    });
    slide.addText("ZYNGRAM  ·  CAMPUS HUB", {
      x: 0.55, y: 7.13, w: 5, h: 0.18, fontFace: "Aptos", fontSize: 8,
      charSpacing: 1, color: "8A867D"
    });
  }

  const closing = pptx.addSlide();
  closing.background = { color: "EAF0E8" };
  closing.addText("A clearer path through campus.", {
    x: 0.8, y: 2.0, w: 10.5, h: 1.1, fontFace: "Georgia", fontSize: 34,
    color: "292820", margin: 0
  });
  closing.addText("Zyngram Campus Hub  ·  Working local prototype", {
    x: 0.85, y: 3.45, w: 8.5, h: 0.45, fontFace: "Aptos", fontSize: 16, color: "74627B"
  });

  console.log(`Writing presentation to ${outFile}`);
  await pptx.writeFile({ fileName: outFile });
  console.log("Presentation created.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
