export async function extractFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (['txt', 'md'].includes(extension)) {
    return await file.text();
  }

  if (extension === 'pdf' && window.pdfjsLib) {
    const workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    const pageCount = Math.min(pdf.numPages, 30);
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return text.trim() || `[PDF: ${file.name} — no extractable text]`;
  }

  if (extension === 'docx' && window.mammoth) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || `[DOCX: ${file.name}]`;
  }

  if (extension === 'pptx' && window.JSZip) {
    const zip = await window.JSZip.loadAsync(file);
    const slides = Object.keys(zip.files)
      .filter((name) => /ppt\/slides\/slide\d+\.xml/.test(name))
      .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1], 10) - parseInt(b.match(/slide(\d+)/)[1], 10));
    let output = '';
    for (const slideName of slides) {
      const xml = await zip.files[slideName].async('text');
      const items = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideText = items.map((item) => item.replace(/<\/?.+?>/g, '')).join(' ');
      output += `[Slide] ${slideText}\n`;
    }
    return output.trim() || `[PPTX: ${file.name} — no text found]`;
  }

  return `[${extension.toUpperCase()}: ${file.name} — paste content below]`;
}
